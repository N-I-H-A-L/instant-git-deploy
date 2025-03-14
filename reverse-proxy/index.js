import express from "express";
import httpProxy from "http-proxy";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = 8000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_PATH = "https://instant-git-deploy.s3.ap-south-1.amazonaws.com/__outputs";
const proxy = httpProxy.createProxy();

const { Client } = pg;
const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
});

pgClient.connect()
  .then(() => console.log("Connected to PostgreSQL successfully!"))
  .catch(err => console.error("Connection error", err.stack));

//Catch all requests
app.use(async (req, res) => {
    //Get the hostname or URL of request
    const hostname = req.hostname;

    //Get the subdomain
    const subdomain = hostname.split('.')[0];

    const query = `SELECT * FROM "Deployment" WHERE subdomain = $1;`;
    const values = [subdomain];

    const result = await pgClient.query(query, values);

    let deployment;
    if (result.rows.length > 0) {
      deployment = result.rows[0];
    }
    else{
        return res.sendFile(path.join(__dirname, "not-found.html"));
    }
    
    if(deployment.status === "FAILED"){
        return res.sendFile(path.join(__dirname, "failed.html"));
    }
    else if(deployment.status === "QUEUED"){
        return res.sendFile(path.join(__dirname, "queued.html"));
    }


    //URL of HTML file in bucket
    const resolvesTo = `${BASE_PATH}/${deployment.id}`;

    return proxy.web(req, res, { target: resolvesTo, changeOrigin: true });
});

proxy.on("proxyReq", (proxyReq, req, res) => {
    const url = req.url;
    if(url === "/"){
        proxyReq.path += "index.html";
    }
});

app.listen(PORT, () => {
    console.log(`Reverse proxy is running on ${PORT}`);
});