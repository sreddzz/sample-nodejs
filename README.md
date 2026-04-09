# AWS CDK TypeScript project

This project uses AWS CDK constructs to provision:

- an S3 bucket with versioning, encryption, SSL enforcement, and blocked public access
- an IAM role for Lambda with read/write access to that bucket

## Useful commands

- `npm install` to install dependencies
- `npm run lint` to lint TypeScript and JavaScript files
- `npm run build` to compile the TypeScript sources
- `npm test` to run the CDK stack assertions
- `npm run synth` to generate the CloudFormation template
- `npm run deploy` to deploy the stack into your AWS account

## Project structure

- `bin/sample-nodejs.ts` bootstraps the CDK app
- `lib/sample-nodejs-stack.ts` defines the S3 bucket and IAM role constructs
- `test/sample-nodejs-stack.test.ts` validates the synthesized template

Before deploying, configure your AWS credentials and bootstrap CDK if needed:

- `npx cdk bootstrap`

Use GitHub Actions to run build, test, synth, and deployment workflows for this CDK app.