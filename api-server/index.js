import express from "express";
import { generateSlug } from "random-word-slugs";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import dotenv from "dotenv";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@clickhouse/client";
import { Kafka } from "kafkajs";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";

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
app.use(cors());

const prisma = new PrismaClient({});
const clickHouseClient = createClient({
  host: "https://clickhouse-4ae734f-royalgamer2051-fc62.f.aivencloud.com",
  database: "default",
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASS,
});

const kafka = new Kafka({
  //clientId -> to uniquely identify our client who will listen, chose Deployment Id and not project Id since a project can have multiple deployemnts.
  clientId: `api-server`,
  brokers: [process.env.KAFKA_BROKER],
  //URL of CA Certificate
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname, "kafka.pem"), "utf-8")],
  },
  sasl: {
    username: process.env.KAFKA_SASL_USER,
    password: process.env.KAFKA_SASL_PASS,
    mechanism: "plain",
  },
});

const consumer = kafka.consumer({ groupId: "api-server-logs-consumer" });

app.post("/project", async (req, res) => {
  const bodyFormat = z.object({
    name: z.string(),
    repoURL: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);

  if (bodyValidation.error)
    return res.status(400).json({ error: bodyValidation.error });

  const { name, repoURL } = bodyValidation.data;

  const project = await prisma.project.create({
    data: {
      name,
      repoURL,
      subDomain: generateSlug(),
    },
  });

  return res.status(200).json(project);
});

app.post("/deploy", async (req, res) => {
  const bodyFormat = z.object({
    projectId: z.string(),
  });

  const bodyValidation = bodyFormat.safeParse(req.body);

  if (bodyValidation.error)
    return res.status(400).json({ error: bodyValidation.error });

  //Get project id from body
  const { projectId } = bodyValidation.data;

  //get the project
  const project = await prisma.project.findUnique({
    where: {
      id: projectId,
    },
  });

  if (!project) res.status(404).json({ error: "Project not found." });

  //Check if there is no running deployment
  const deployment = await prisma.deployment.create({
    data: {
      project: {
        connect: {
          id: projectId,
        },
      },
      status: "QUEUED",
    },
  });

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
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

async function initKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({
    topics: ["build-logs"]
  });
  await consumer.run({
    autoCommit: false,
    eachBatch: async function ({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) {
      const messages = batch.messages;
      console.log("Received ", messages.length, " messages...");
      for(const message of messages) {
        const { msg }  = message.value.toString();
        const { PROJECT_ID, DEPLOYMENT_ID, log } = JSON.parse(msg);

        const { query_id } = await clickHouseClient.insert({
          table: "log_events",
          values: [
            {
              event_id: uuidv4(),
              deployment_id: DEPLOYMENT_ID,
              log,
            }
          ],
          format: "JSONEachRow"
        });

        console.log(query_id, " inserted.");
        resolveOffset(message.offset);
        await commitOffsetsIfNecessary(message.offset);
        await heartbeat();
      }
    }
  })
}

initKafkaConsumer();
app.listen(PORT, () => {
  console.log(`API server is running on ${PORT}`);
});
