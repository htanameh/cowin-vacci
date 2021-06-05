import dotenv from 'dotenv';
import logger from './logger.js';
import axios from 'axios';
import moment from 'moment';
import cron from 'node-cron';

dotenv.config();

import db from './db.js';

// Add a response interceptor
axios.interceptors.response.use(function (response) {
    // Any status code that lie within the range of 2xx cause this function to trigger
    // Do something with response data
    return response;
}, function (error) {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Do something with response error
    logger.error('Error in API request');
    if (error.response) {
        logger.error(JSON.stringify(error.response.config));
        logger.error(JSON.stringify(error.response.data));
    }
    return Promise.reject(error);
});

const DEFAULT_PUBLIC_API_HEADER = {
    "Accept-Language": "hi_IN",
};

const DEFAULT_API_URL_BASE = "https://cdn-api.co-vin.in";
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";


const fetchStateId = () => {
    return '31'; // State ID for TamilNadu --> Refer https://cdn-api.co-vin.in/api/v2/admin/location/states
}

const fetchDistrictIds = () => {
    return ['571', '572']; // District ID for Chennai and Tiruvallur --> Refer https://cdn-api.co-vin.in/api/v2/admin/location/districts/31
};

/**
 * 
 * @param {string} districtId 
 * @param {string} date format is dd-mm-yyyy
 */
const constructFetchSessionsByDistrictURL = (districtId, date) => {
    return `${DEFAULT_API_URL_BASE}/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${date}`;
};

/**
 * 
 * @param {string} botToken 
 * @param {cahtId} chatId
 * @param {string} message 
 */
const constructTelegramSendMessageURL = (botToken) => {
    return `${DEFAULT_TELEGRAM_API_BASE_URL}/bot${botToken}/sendMessage`;
};

const sendTelegramNotification = async (message, session, pincode) => {
    try {
        const chatID = process.env.TELEGRAM_CHAT_ID;
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!chatID || !botToken) {
            logger.info('Telegram env config not found');
            return;
        }
        const telegramUrl = constructTelegramSendMessageURL(botToken);
        await axios.post(telegramUrl, {
            chat_id: chatID,
            text: message,
            parse_mode: 'MarkdownV2',
        });
        // Pincodes near ambattur
        const specailAlertPincode = ['600095', '600053', '600037', '600101', '600049', '600050', '600071', '600057', '600054', '600077'];
        if (specailAlertPincode.includes(`${pincode}`)) {
            logger.info('Special Alert Triggered');
            const specialChatId = process.env.SP_TELEGRAM_CHAT_ID;
            await axios.post(telegramUrl, {
                chat_id: specialChatId,
                text: message,
                parse_mode: 'MarkdownV2',
            });
        }
        await updateSessionToDB(session);
    } catch (err) {
        logger.error(`Error in sendTelegramNotification`);
        logger.error(err.toString());
    }

};

const getSessionFromDB = async (sessionId) => {
    let sessionInDB;
    try {
        sessionInDB = await db.get(sessionId);
    } catch (err) {
        if (err.message === 'missing') {
            // ignore
        } else {
            logger.error(`Error in getSessionFromDB`);
            logger.error(err.toString());
        }
    } finally {
        return sessionInDB;
    }
};

const updateSessionToDB = async (session) => {
    try {
        let sessionFields = {
            _id: session.session_id,
            original_session: JSON.stringify(session),
            notification_date_time: moment().format(),
            notification_count: 1,
        };
        const sessionInDB = await getSessionFromDB(session.session_id);
        if (sessionInDB) {
            sessionFields = {
                ...sessionFields,
                notification_count: sessionInDB.notification_count + 1,
                _rev: sessionInDB._rev,
            }
        }
        await db.put(sessionFields, { force: true });
    } catch (err) {
        logger.error(`Error in updateSessionToDB`);
        logger.error(err.toString());
    }
};

const checkIfSessionIsNotified = (session) => {
    try {
        if (session) {
            const lastNotifiedDate = moment(session.notification_date_time);
            if (lastNotifiedDate.isValid() && moment().diff(lastNotifiedDate, 'minutes') < 30) {
                return true;
            }
        }
        return false;
    } catch (err) {
        logger.error(`Error in checkIfSessionIsNotified`);
        logger.error(err.toString());
    }
};

const fetchSessionsByDistrictId = async (districtId) => {
    try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
        const yyyy = today.getFullYear();

        const dateToday = dd + '-' + mm + '-' + yyyy;
        const url = constructFetchSessionsByDistrictURL(districtId, dateToday);
        const response = await axios.get(url, { headers: { ...DEFAULT_PUBLIC_API_HEADER } });
        const centers = response.data.centers;
        const templateString =
            `Below details found
            \*Name\*: {{centerName}}
            \*District\*: {{districtName}}
            \*Pincode\*: {{pincode}}
            \*Fee Type\*: {{feeType}}
            \*Vaccine\*: {{vaccineName}}
            \*Fees\*: {{fees}} rs
            \*Date\*: {{availableDate}}
            \*Age\*: {{age}}
            \*Dose 1\*: {{dose1}} slots
            \*Dose 2\*: {{dose2}} slots
        \\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-
            Click [here](https://selfregistration.cowin.gov.in/) to login and schedule: 
            \\(notification count for this session: {{notiCount}} \\)
        `;
        if (centers && centers.length) {
            // keeping track of available sessions
            let availableSessionIds = [];
            const availableCenters = centers.filter(center => {
                try {
                    const sessions = center.sessions;
                    if (sessions && sessions.length) {
                        const availableSessions = sessions.filter(session => {
                            try {
                                const totalAvailableCapacity = session.available_capacity;
                                const dose1 = session.available_capacity_dose1;
                                const dose2 = session.available_capacity_dose2;
                                const ageLimit = session.min_age_limit;
                                // Right now only checking if dose 1 is available for age limit 18
                                if (totalAvailableCapacity && dose1 && ageLimit === 18) {
                                    availableSessionIds.push(session.session_id);
                                    return true;
                                }
                                return false;
                            } catch (err) {
                                logger.error(`Error in fetchSessionsByDistrictId --> centers --> sessions -->  filter`);
                                logger.error(err.toString());
                                return false;
                            }
                        });
                        if (availableSessions && availableSessions.length) {
                            return true;
                        }
                    };
                    return false;
                } catch (err) {
                    logger.error(`Error in fetchSessionsByDistrictId --> centers --> filter`);
                    logger.error(err.toString());
                    return false;
                }
            });
            if (availableCenters && availableCenters.length) {
                availableCenters.forEach(center => {
                    try {
                        let notificationMessage = templateString
                            .replace('{{centerName}}', center.name.replace(/-/g, '\\-'))
                            .replace('{{feeType}}', center.fee_type)
                            .replace(`{{districtName}}`, center.district_name)
                            .replace(`{{pincode}}`, center.pincode);
                        const sessions = center.sessions.filter(session => availableSessionIds.includes(session.session_id));
                        if (sessions && sessions.length) {
                            sessions.forEach(async session => {
                                try {
                                    const vaccineFee = center.vaccine_fees.find(v => v.vaccine === session.vaccine);
                                    const sessionInDB = await getSessionFromDB(session.session_id);
                                    notificationMessage = notificationMessage
                                        .replace('{{vaccineName}}', session.vaccine)
                                        .replace('{{fees}}', vaccineFee ? vaccineFee.fee : 'NA')
                                        .replace('{{availableDate}}', session.date.replace(/-/g, '/'))
                                        .replace('{{age}}', session.min_age_limit)
                                        .replace('{{dose1}}', session.available_capacity_dose1)
                                        .replace('{{dose2}}', session.available_capacity_dose2)
                                        .replace('{{notiCount}}', sessionInDB ? sessionInDB.notification_count : 1);
                                    const isSessionNotified = checkIfSessionIsNotified(sessionInDB);
                                    if (!isSessionNotified) {
                                        sendTelegramNotification(notificationMessage, session, center.pincode);
                                    }
                                } catch (err) {
                                    logger.error(`Error in fetchSessionsByDistrictId --> availableCenters --> sessions -->  filter`);
                                    logger.error(err.toString());
                                    return false;
                                }
                            });
                        }
                    } catch (err) {
                        logger.error(`Error in fetchSessionsByDistrictId --> availableCenters -->  filter`);
                        logger.error(err.toString());
                        return false;
                    }
                })
            }
        }
    } catch (error) {
        logger.error(`Error in fetchSessionsByDistrictId`);
        logger.error(error.toString());
    }
};


const startSearch = () => {
    const districts = fetchDistrictIds();
    districts.forEach(districtId => {
        fetchSessionsByDistrictId(districtId);
    });
};

const scheduleCron = () => {
    logger.info('Cron Scheduled');
    // cron running every 2 minutes
    cron.schedule('*/2 * * * *', () => {
        logger.info('Cron running')
        startSearch();
    });
};

// Dummy Server setup for heroku free account use
import express, { response } from 'express';
const PORT = process.env.PORT || 5000

const dummyHerokuPing = async () => {
    try {
        logger.info('process.env.HEROKU_APP_NAME');
        logger.info(process.env.HEROKU_APP_NAME);
        let url = `https://guarded-thicket-80071.herokuapp.com/`;
        if(process.env.HEROKU_APP_NAME) {
            url = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com/`;
        }
        const herokuPingResponse = await axios.get(url);
        logger.info('Ping done');
        logger.info(JSON.stringify(herokuPingResponse.data));
    } catch (err) {
        logger.error('Error in heroku ping');
        logger.error(err.toString());
    }
}

const scheduleHerokuPing = () => {
    logger.info('Cron Scheduled - Heroku');
    // cron running every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        logger.info('Heroku Cron running')
        dummyHerokuPing();
    });
};

express()
    .get('/', (req, res) => res.send({ message: 'done' }))
    .listen(PORT, () => {
        console.log(`Listening on ${PORT}`);
        scheduleCron();
        if (process.env.NODE_ENV === 'production') {
            scheduleHerokuPing();
        }
    });