import winston from 'winston';

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'user-service' },
    transports: [
        //
        // - Write all logs with level `error` and below to `error.log`
        // - Write all logs with level `info` and below to `combined.log`
        //
        new winston.transports.File({
            filename: 'log/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB, 
            maxFiles: 5,
        }),
        new winston.transports.File({ 
            filename: 'log/combined.log',
            maxsize: 5242880, // 5MB, 
            maxFiles: 5,
        }),
    ],
});

//
// Log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
logger.add(new winston.transports.Console({
    format: winston.format.simple(),
    json: false,
    level: 'debug',
    handleExceptions: true,
}));

// Call exceptions.handle with a transport to handle exceptions
logger.exceptions.handle(
    new winston.transports.File({ 
        filename: 'log/exceptions.log',
        maxsize: 5242880, // 5MB, 
        maxFiles: 5,
    })
);

console.log('process.env.NODE_ENV', process.env.NODE_ENV)

export default logger;