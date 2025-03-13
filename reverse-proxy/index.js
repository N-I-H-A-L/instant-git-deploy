import express from "express";
import httpProxy from "http-proxy";

const app = express();
const PORT = 8000;

const BASE_PATH = "https://instant-git-deploy.s3.ap-south-1.amazonaws.com/__outputs";

const proxy = httpProxy.createProxy();

//Catch all requests
app.use(async (req, res) => {
    //Get the hostname or URL of request
    const hostname = req.hostname;

    //Get the subdomain
    const subdomain = hostname.split('.')[0];

    //URL of HTML file in bucket
    const resolvesTo = `${BASE_PATH}/${subdomain}`;

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