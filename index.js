#!/usr/bin/env node
const WebSocket = require('ws');
const config = require('config');
const smacker = require('smacker');
const pino = require('pino');
const axios = require('axios');

const log = pino();

const Service = function Service() {
    const connections = [];

    if (!config.alerts.length) {
        throw new Error('No alerts configured');
    }

    return {
        start: async () => {
            config.alerts.forEach((alert) => {
                const epoch = (new Date()).getTime() / 1000;
                const query = encodeURI(alert.query);
                const ws = new WebSocket(`ws://${config.lokiUrl}/loki/api/v1/tail?query=${query}&start=${epoch}`);
                connections.push(ws);

                ws.on('open', (...args) => log.info({ epoch, query, args }, 'Websocket opened'));
                ws.on('close', (code, error) => log.info({ code, error: error.toString() }, 'Websocket closed'));
                ws.on('error', (...args) => log.error({ args }, 'Websocket error'));

                ws.on('message', (data) => {
                    const { streams } = JSON.parse(data);
                    streams.forEach((stream) => {
                        const logLine = stream.values[0][1];
                        const { namespace } = stream.stream;

                        const conditionTriggers = [];
                        for (const condition of alert.conditions) {
                            const triggers = [];

                            if (condition.includes && logLine.includes(condition.includes)) triggers.push(condition.includes);
                            if (condition.parseError === 'json') {
                                try {
                                    JSON.parse(logLine);
                                } catch (error) {
                                    if (error.name === 'SyntaxError') triggers.push('json parse error');
                                    else throw error;
                                }
                            }

                            if (triggers.length) conditionTriggers.push(triggers);
                        }
                        if (conditionTriggers.length) dispatch(alert, namespace, logLine, conditionTriggers);
                    });
                });
            });
        },
        stop: async () => {
            await Promise.all(connections.map(async (connection) => connection.close()));
        },
    };
};

async function dispatch(alert, namespace, logLine, conditionTriggers) {
    for (const receiver of config.receivers) {
        if (receiver.type === 'log') {
            log[receiver.level]({
                alert,
                logLine,
                namespace,
                conditionTriggers,
            });
        }

        if (receiver.type === 'alertmanager') {
            axios({
                method: 'post',
                url: `${receiver.url}/api/v2/alerts`,
                data: [
                    {
                        startsAt: (new Date()).toISOString(),
                        annotations: { logLine, triggers: JSON.stringify(conditionTriggers) },
                        labels: { job: alert.name, namespace, logLine },
                    },
                ],
            });
        }
    }
}

const service = new Service();

smacker.start(service, { jsonLog: true });
