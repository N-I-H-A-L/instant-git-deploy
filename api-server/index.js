import express from "express";
import { generateSlug } from "random-word-slugs";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import dotenv from "dotenv";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const app = express();
const PORT = 9000;

dotenv.config();

//Credentials are same as that given to S3
const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

//Cluster and Task Definition we created in AWS
const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:761018889513:cluster/builder-git-deploy",
  TASK: "arn:aws:ecs:ap-south-1:761018889513:task-definition/builder-git-deploy-task",
};

app.use(express.json());

const prisma = new PrismaClient({});

app.post("/project", async (req, res) => {
  const bodyFormat = z.object({
    name: z.string(),
    repoURL: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);
  
  if(bodyValidation.error) return res.status(400).json({error: bodyValidation.error});

  const { name, repoURL } = bodyValidation.data;

  const project = await prisma.project.create({
    data: {
      name,
      repoURL,
      subDomain: generateSlug(),
    }
  });

  return res.status(200).json(project);
})

app.post("/deploy", async (req, res) => {
  const bodyFormat = z.object({
    projectId: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);
  
  if(bodyValidation.error) return res.status(400).json({error: bodyValidation.error});

  //Get project id from body
  const { projectId } = bodyValidation.data;

  //get the project
  const project = await prisma.project.findUnique({
    where: {
      id: projectId
    }
  });

  if(!project) res.status(404).json({ error: "Project not found." });

  //Check if there is no running deployment
  const deployment = await prisma.deployment.create({
    data: {
      project: {
        connect: {
          id: projectId
        }
      },
      status: "QUEUED",
    }
  })

  //Config of command
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-0d80db1951c6cf909",
          "subnet-0d394f5ff44f8f33d",
          "subnet-06ef780a4c7fd4a6b",
        ],
        securityGroups: ["sg-0e319cc3d00c2982b"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-git-deploy-image",
          environment: [
            {
              name: "GIT_REPO_URL",
              value: project.repoURL,
            },
            {
              name: "PROJECT_ID",
              value: projectId,
            },
            {
              name: "DEPLOYMENT_ID",
              value: deployment.id,
            }
          ],
        },
      ],
    },
  });

  //Execute the command
  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

app.listen(PORT, () => {
  console.log(`API server is running on ${PORT}`);
});
