import express from "express";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import dotenv from "dotenv";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import Redis from "ioredis";

const app = express();
const PORT = 9000;
const STATUS_CHANNEL = "status";
const LOGS_CHANNEL = "logs";

dotenv.config();

//Credentials are same as that given to S3
const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const redisClient = new Redis(process.env.REDIS);

function getMessages(id) {
  redisClient.on("message", async (channel, message) => {
    if (channel === `${LOGS_CHANNEL}:${id}`) {
      console.log(message);
    } else {
      try {
        const parsedMessage = JSON.parse(message);
        const { status, deploymentId } = parsedMessage;
        await prisma.deployment.update({
          where: { id: deploymentId },
          data: { status },
        });

        console.log(`Project is ${status}`);
      } catch (err) {
        console.error("Error processing Redis message:", err);
      }
    }
  });
}

//Cluster and Task Definition we created in AWS
const config = {
  CLUSTER: "arn:aws:ecs:ap-south-1:761018889513:cluster/builder-git-deploy",
  TASK: "arn:aws:ecs:ap-south-1:761018889513:task-definition/builder-git-deploy-task:4",
};

app.use(express.json());
app.use(cors());

const prisma = new PrismaClient({});

app.post("/project", async (req, res) => {
  const bodyFormat = z.object({
    repoURL: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);

  if (bodyValidation.error)
    return res.status(400).json({ error: bodyValidation.error });

  const { repoURL } = bodyValidation.data;

  const projectData = {
    repoURL,
  };

  try {
    const project = await prisma.project.create({
      data: projectData,
    });

    return res.status(201).json(project);
  } catch (err) {
    return res.status(500).json({ error: "Something went wrong", err });
  }
});

app.post("/deploy", async (req, res) => {
  const bodyFormat = z.object({
    projectId: z.string(),
    subdomain: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);

  if (bodyValidation.error)
    return res.status(400).json({ error: bodyValidation.error });

  //Get project id from body
  const { projectId, subdomain } = bodyValidation.data;

  if (subdomain.includes(".")) {
    res.status(400).json({
      error: "Subdomain cannot contain dot(.) character.",
    });
  }

  //get the project
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
  });

  if (!project) res.status(404).json({ error: "Project not found." });

  let deployment;
  try {
    deployment = await prisma.deployment.create({
      data: {
        project: {
          connect: {
            id: projectId,
          },
        },
        subdomain,
        status: "NOT_STARTED",
      },
    });

    //At first add the listeners
    getMessages(deployment.id);

    //Then subscribe to channels
    redisClient.subscribe(
      `${LOGS_CHANNEL}:${deployment.id}`,
      `${STATUS_CHANNEL}:${deployment.id}`,
      (err, count) => {
        if (err) {
          console.error("Failed to subscribe:", err);
        } else {
          console.log(`Subscribed to ${count} channel(s).`);
        }
      }
    );
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Subdomain is already taken" });
    }
    return res.status(500).json({ error: "Something went wrong", err });
  }

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
            },
          ],
        },
      ],
    },
  });

  //Execute the command
  await ecsClient.send(command);

  return res.json({
    status: "queued",
    data: {
      projectId,
      url: `http://${subdomain}.localhost:8000`,
      projectId,
    },
  });
});

app.listen(PORT, () => {
  console.log(`API server is running on ${PORT}`);
});
