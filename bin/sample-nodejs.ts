#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SampleNodejsStack } from '../lib/sample-nodejs-stack';

const app = new cdk.App();

new SampleNodejsStack(app, 'SampleNodejsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
