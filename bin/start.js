#!/usr/bin/env node
const config = require('config');
const smacker = require('smacker');
const pino = require('pino');
const Service = require('../lib/Service');

const log = pino();
const service = new Service({ config, log });

smacker.start(service, { jsonLog: true });
