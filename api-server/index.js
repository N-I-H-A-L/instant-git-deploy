import express from "express";
import { generateSlug } from "random-word-slugs";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import dotenv from "dotenv";

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

app.post("/deploy", async (req, res) => {
  //Get repo url from body
  const { repoURL } = req.body;

  //to generate unique project ID consisting of random words
  const projectSlug = generateSlug();

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
              value: repoURL,
            },
            {
              name: "PROJECT_ID",
              value: projectSlug,
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
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

app.listen(PORT, () => {
  console.log(`API server is running on ${PORT}`);
});
