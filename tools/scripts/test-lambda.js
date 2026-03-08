#! /usr/bin/env node

const { execSync } = require('child_process');

const folderName = 'hello-world';
const region = 'us-east-2';

const opts = { encoding: 'utf-8' };

execSync(
  `aws lambda invoke --function-name ${folderName} outputfile.txt --cli-binary-format raw-in-base64-out --region ${region}`,
  opts
);
