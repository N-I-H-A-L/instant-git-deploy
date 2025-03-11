import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { fileURLToPath } from "url";
import { Kafka } from "kafkajs";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

// PROJECT_ID should be specified in the container execution command
const PROJECT_ID = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const kafka = new Kafka({
  //clientId -> to uniquely identify our client who will listen, chose Deployment Id and not project Id since a project can have multiple deployemnts.
  clientId: `builder-${DEPLOYMENT_ID}`,
  brokers: [process.env.KAFKA_BROKER],
  //URL of CA Certificate
  //CA (Certificate Authority) file is used to ensure secure communication with the Kafka server.
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname, "kafka.pem"), "utf-8")],
  },
  sasl: {
    username: process.env.KAFKA_SASL_USER,
    password: process.env.KAFKA_SASL_PASS,
    mechanism: "plain",
  },
});

const producer = kafka.producer();

async function publishLog(log) {
  await producer.send({
    topic: `build-logs`,
    messages: [
      {
        key: "log",
        value: JSON.stringify({ PROJECT_ID, DEPLOYMENT_ID, log }),
      },
    ],
  });
}

async function init() {
  await producer.connect();

  console.log("Executing script");
  await publishLog("Build started...");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Go to output folder (all the source code will be present in "output" folder as specified in main.sh)
  const outDirPath = path.join(__dirname, "output");

  // Go to output dir and install and build the files
  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  //Console log the output of the process
  p.stdout.on("data", async (data) => {
    const getLog = data.toString();
    console.log(getLog);
    await publishLog(getLog);
  });

  // Listen for errors
  p.stdout.on("error", async (data) => {
    const getLog = data.toString();
    console.log("Error: ", getLog);
    await publishLog("Error: ", getLog);
  });

  // When process gets finished
  p.on("close", async () => {
    console.log("Build completed");
    await publishLog("Build completed!");

    // The build files will be present in "output/dist" folder
    const distFolderPath = path.join(__dirname, "output", "dist");

    // Read the contents of the folder, recursive true means it will go keep going inside directories
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    // Loop over the file paths
    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);

      // If path is of a directory continue. Since inside the dist folder there can be directories like "assets" which contains media files.
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("uploading ", filePath);
      await publishLog(`uploading ${filePath}`);

      const command = new PutObjectCommand({
        //bucket name
        Bucket: process.env.AWS_BUCKET_NAME,
        //Path in the bucket where to store the file
        Key: `__outputs/${PROJECT_ID}/${file}`,
        //actual content of the file
        Body: fs.createReadStream(filePath),
        //Dynamically get content type of file
        ContentType: mime.lookup(filePath),
      });

      //Send the command we created
      await s3Client.send(command);
      console.log("uploaded ", filePath);
      await publishLog(`uploaded ${filePath}`);
    }

    console.log("Done...");
    await publishLog("Done...");

    //To terminate the container
    process.exit(0);
  });
}

init();
