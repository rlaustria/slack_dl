const fs = require('fs');

const stripBrackets = (array, cursor) => {
	array = JSON.stringify(array, null, 5);
	array = array.substring(0, array.length - 2) + `${cursor ? ',' : ''}` + '\n';
	array = array.substring(2, array.length);
	return array;
};

const writeArrayTofile = async (file, data, cursor, next, cb = () => {}) => {
	data = stripBrackets(data, cursor);

	fs.appendFileSync(file, data, (err) => {
		if (err) {
			console.log(`Error writing to file users.json`);
			console.log(err);
		}
	});

	if (cursor) return next();
	else {
		fs.appendFileSync(file, ']', (err) => {
			if (err) {
				console.log(`Error writing to file user.json`);
				console.log(err);
			}
		});
		cb();
		return;
	}
};

module.exports.stripBrackets = stripBrackets;
module.exports.writeArrayTofile = writeArrayTofile;
