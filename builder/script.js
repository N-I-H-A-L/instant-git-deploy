import { exec } from "child_process";
import path from "path";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import mime from "mime-types";

const s3Client = new S3Client({
    region: '',
    credentials: {
        accessKeyId: '',
        secretAccessKey: '',
    }
});

const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
    console.log("Executing script");

    // Go to output folder (all the source code will be present in "output" folder as specified in main.sh)
    const outDirPath = path.join(__dirname, "output");

    // Go to output dir and install and build the files
    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    //Console log the output of the process
    p.stdout.on("data", (data) => {
        console.log(data.toString())
    });

    // Listen for errors
    p.stdout.on("error", (data) => {
        console.log("Error ", data.toString())
    });

    // When process gets finished
    p.on("close", async () => {
        console.log("Build completed");
        // The build files will be present in "output/dist" folder
        const distFolderPath = path.join(__dirname, "output", "dist");

        // Read the contents of the folder, recursive true means it will go keep going inside directories
        const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

        // Loop over the file paths
        for(const filePath of distFolderContents) {
            // If path is of a directory continue. Since inside the dist folder there can be directories like "assets" which contains media files.
            if(fs.lstatSync(filePath).isDirectory()) continue;

            const command = new PutObjectCommand({
                //bucket name
                Bucket: '',
                //Path in the bucket where to store the file
                Key: `__outputs/${PROJECT_ID}/${filePath}`,
                //actual content of the file
                Body: fs.createReadStream(filePath),
                //Dynamically get content type of file
                ContentType: mime.lookup(filePath),
            });

            //Send the command we created
            await s3Client.send(command);
        }

        console.log("Done...");
    });
}