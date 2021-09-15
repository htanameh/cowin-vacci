import axios from 'axios';
import FormData from 'form-data';
import { uniqueNamesGenerator, NumberDictionary } from 'unique-names-generator';
import csv from 'csv-parser';
import fs from 'fs';
import logger from '../logger.js';
import path from 'path';

const upRef = async (name, email, mobile, refID) => {
	var data = new FormData();
	data.append('name', name);
	data.append('email', email);
	data.append('Mobile', mobile);
	data.append('reflink', refID);
	data.append('captcha', 'captcha');
	data.append(
		'response',
		'03AGdBq24IQ40VoK2tsCbEoqrcs233fGOTbS01yflOjqBVy1oVldADTd-VigjX2PUWjb5lurR3QlW752wDLEddP0UOAktuiItpOI6jIOhP4VOzk5sJ-cMBTdfp1fawbSBdEdzQdLoB9TZtRdU_87EXdKCEQNVFcwcKGSosYoUUoQS_oTRTxugRD7rmiuBt-Aytat9oXe7dRo5sp1LuMjbdJeFHrH8mrrS1Q-jP0x-Sm4PxsSqpGYsZ2nfyV8xCg8sJjOBbiUYD2ezntasL-ptDnlPQZArNcJrBOMtz_PySK8C9q6FeoJGOv6jMWQKQulzqlpwsoLIhmjDjZVoN3AQ2jMzvls0a_WTBXlGQC8qDk1c8xmEd1w2err5vGC5lsaFfGmhDYzKfC7jMG28dsRUMRzS5JtcPue2-whodV1B3EIcoVAMKVt-9-wAKEaxxwkQ7S6drQwaHctOQ1vXfK6CvGgVLgdk9JlUrSg'
	);

	var config = {
		method: 'post',
		url: `https://app.upviral.com/site/parse_new_users/call/ajax/campId/120227/reflink/${refID}`,
		headers: {
			accept:
				' text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
			'accept-encoding': ' gzip, deflate, br',
			'accept-language': ' en-GB,en;q=0.9',
			'cache-control': ' max-age=0',
			'content-length': ' 587',
			'content-type': ' application/x-www-form-urlencoded',
			cookie:
				' PHPSESSID=node1~k2f0ssohee9qu7q02a3x462vt8; PHPSESSID=node1~k2f0ssohee9qu7q02a3x462vt8',
			origin: ' https://app.upviral.com',
			referer:
				` https://app.upviral.com/site/parse_new_users/call/ajax/campId/120227/reflink/${refID}`,
			'sec-ch-ua':
				' "Google Chrome";v="86", " Not;A Brand";v="86", "Chromium";v="86"',
			'sec-ch-ua-mobile': ' ?0',
			'sec-ch-ua-platform': ' "windows"',
			'sec-fetch-dest': ' document',
			'sec-fetch-mode': ' navigate',
			'sec-fetch-site': ' same-origin',
			'sec-fetch-user': ' ?1',
			'upgrade-insecure-requests': ' 1',
			...data.getHeaders(),
		},
		data: data,
	};
	try {
		const res = await axios(config);
		if (JSON.stringify(res.data).includes('thankyou')) {
            logger.info(`Success for referral ${refID}`);
        } else {
            logger.error(`Error in up ref - CAPTCHA - ${refID}`);
        }
	} catch (err) {
        logger.error(`Error in up ref - ${refID}`);
        logger.error(err.toString());
	}
};

function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

const sleep = (seconds) => {
	return new Promise((res, rej) => setTimeout(res, seconds * 1000));
};

const results = [];

fs.createReadStream(path.resolve('up_ref', './names.csv'))
	.pipe(csv())
	.on('data', (data) => {
        try {
            if(typeof String.prototype.replaceAll == "undefined") {
                String.prototype.replaceAll = function(match, replace){
                   return this.replace(new RegExp(match, 'g'), () => replace);
                }
            }            
            results.push(
                data.name
                    .replaceAll(' ', '')
                    .replaceAll('@', '_')
                    .replaceAll('@', '_')
                    .replaceAll('/', '_')
                    .replaceAll('\\', '_')
            );
        } catch (err) {
            results.push(data.name)
        }
	})
	.on('end', () => {
		logger.info('CSV READ');
        logger.info(results[30]);
	});

export const addReferral = (refID) => {
    const baseSeriesArr = [9000, 6000];
    const baseEmailArr = ['gmail.com', 'yahoo.com'];
    const numberDictionary = NumberDictionary.generate({ min: 1950, max: 2015 });
    const baseDictionariesArr = [results, numberDictionary];
    const config = {
        dictionaries: baseDictionariesArr,
        length: 2,
        separator: '',
    }
    const email = uniqueNamesGenerator(config) + '@' + baseEmailArr[getRandomInt(0, 1)]
    const name = email.split('@')[0];
    const baseFour = baseSeriesArr[getRandomInt(0, 1)] + getRandomInt(100, 999);
    const number = baseFour + '' + getRandomInt(100000, 999999)
    logger.info(name)
    logger.info(email)
    logger.info(number)
    upRef(name, email, number, refID);
};

export default results;
