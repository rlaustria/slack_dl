const qs = require('qs');
const axios = require('axios');
const fs = require('fs');
const { mkdir, rm, access } = require('fs/promises');
const { each, eachLimit } = require('async');
const { writeArrayTofile } = require('./helpers');

const DOWNLOAD_DIR = './download';
const MESSAGE_DIR = './download/messages';
const USERS_DIR = './download/users';
const RATE = 100;

let done = 0;
let total = 0;

//--------------------
// Credentials
//--------------------

const token = '';
axios.defaults.headers['Authorization'] = `Bearer ${token}`;

let channelList = [];

// sleep function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createDir() {
	// delete and recreate folders
	try {
		await rm(DOWNLOAD_DIR, { recursive: true });
		await rm(USERS_DIR, { recursive: true });
		await rm(MESSAGE_DIR, { recursive: true });

		await mkdir(DOWNLOAD_DIR);
		await mkdir(USERS_DIR);
		await mkdir(MESSAGE_DIR);
	} catch (error) {
		await mkdir(DOWNLOAD_DIR);
		await mkdir(USERS_DIR);
		await mkdir(MESSAGE_DIR);
	}
}

const getChannelList = function (cursor = '') {
	// build channel list and create files

	return axios
		.get(`https://slack.com/api/conversations.list?types=public_channel,private_channel&cursor=${cursor}`)
		.then((res) => res.data)
		.then((data) => {
			if (!data.ok) {
				console.log('Error querying channel list');
				console.log(data);
				return;
			} else {
				let channels = data.channels.map((c) => {
					fs.access(`${MESSAGE_DIR}/${c.name}.json`, fs.F_OK, (err) => {
						if (err) {
							let dir = `${MESSAGE_DIR}/${c.name}`;
							let file = `${dir}/${c.name}.json`;
							fs.mkdirSync(dir);
							fs.writeFileSync(file, '[\n', (err) => {
								if (err) console.log(`Error creating file ${c.name}.json`);
							});
						} else {
						}
					});
					return [c.id, c.name];
				});
				channelList = [...channelList, ...channels];

				const nextCursor = data.response_metadata ? data.response_metadata.next_cursor : '';

				if (nextCursor) return getChannelList(nextCursor);
				else {
					total = channelList.length;
					return;
				}
			}
		});
};

const getChannelMessages = function (channel, cursor = '') {
	// query messages for channel and write to file
	let [id, channelName] = channel;
	let file = `${MESSAGE_DIR}/${channelName}/${channelName}.json`;
	return axios
		.post(`https://slack.com/api/conversations.history?cursor=${cursor}`, qs.stringify({ channel: id }))
		.then((res) => res.data)
		.then(async (data) => {
			const nextCursor = data.response_metadata ? data.response_metadata.next_cursor : '';

			// write message
			let messages = data.messages;

			await eachLimit(messages, RATE, async function (message) {
				if (message.thread_ts == message.ts) {
					return await getThreadMessages(id, channelName, message.thread_ts, '');
				}
			});

			return writeArrayTofile(
				file,
				messages,
				nextCursor,
				() => {
					getChannelMessages(channel, nextCursor);
				},
				() => {
					done++;
					console.log(`Downloading : ${done}/${total} done`);
				}
			);
		})
		.catch(async (err) => {
			if (!err.response) console.log(err);
			let data = err.response.data;
			if (!data.ok) {
				if (data.error && data.error === 'ratelimited') {
					await delay(parseInt(err.response.headers['retry-after']) * 1000);
					return await getChannelMessages(channel, cursor);
				} else {
					console.log(`Error querying messages for ${channelName}`);
					console.log(data);
					fs.appendFileSync(file, JSON.stringify(data), (err) => {
						if (err) {
							console.log(`Error writing to file ${channelName}.json`);
							console.log(err);
						}
					});
					return;
				}
			}
		});
};

const getThreadMessages = async function (channel, channelName, ts, cursor = '') {
	// query user list and write data to file
	let ts_name = ts.replace('.', '_');
	let file = `${MESSAGE_DIR}/${channelName}/thread_${ts_name}.json`;
	try {
		return await access(file, fs.F_OK);
	} catch (error) {
		fs.writeFileSync(file, '[\n', (err) => {
			if (err) console.log(`Error creating file ${file}`);
		});

		return axios
			.get(`https://slack.com/api/conversations.replies?channel=${channel}&ts=${ts}&cursor=${cursor}`)
			.then((res) => res.data)
			.then((data) => {
				if (!data.ok) {
					console.log('Error querying user list');
					console.log(data);
					return;
				} else {
					const nextCursor = data.response_metadata ? data.response_metadata.next_cursor : '';

					// write message
					let messages = data.messages;
					writeArrayTofile(file, messages, nextCursor, () => {
						getThreadMessages(channel, channelName, ts, nextCursor);
					});
				}
			})
			.catch((err) => console.log(err));
	}
};

const getUsers = function (cursor = '') {
	// query user list and write data to file
	let file = `${USERS_DIR}/users.json`;
	fs.access(file, fs.F_OK, (err) => {
		if (err) {
			fs.writeFileSync(`${USERS_DIR}/users.json`, '[\n', (err) => {
				if (err) console.log(`Error creating file users.json`);
			});

			return axios
				.get(`https://slack.com/api/users.list?cursor=${cursor}`)
				.then((res) => res.data)
				.then((data) => {
					if (!data.ok) {
						console.log('Error querying user list');
						console.log(data);
						return;
					} else {
						const nextCursor = data.response_metadata ? data.response_metadata.next_cursor : '';

						// write message
						let users = data.members;
						writeArrayTofile(file, users, nextCursor, () => {
							getUsers(nextCursor);
						});
					}
				});
		}
	});
};

async function run() {
	await createDir();
	await getUsers();
	await getChannelList();

	console.log('Downloading......');

	await eachLimit(channelList, RATE, async function (channel) {
		return await getChannelMessages(channel);
	});
}

run();
