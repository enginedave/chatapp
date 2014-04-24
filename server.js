var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var mongoose = require('mongoose');
//var nicknames = [];// this was an array to hold the unique nickname
var users = {};//this is an empty object to hold the list of unique users


//  Set the environment variables we need.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP;
console.log('nodejs ip address is: ' + ipaddress);
var port = process.env.OPENSHIFT_NODEJS_PORT || 8080;
console.log('nodejs port is: ' + port);

if (typeof ipaddress === "undefined") {
	//  Log errors on OpenShift but continue w/ 127.0.0.1 - this
	//  allows us to run/test the app locally.
	console.warn('No OPENSHIFT_NODEJS_IP var, using 127.0.0.1');
	ipaddress = "127.0.0.1";
};

server.listen(port, ipaddress, function() {
	console.log('Node server started');
});

//connect to the database thirdnode
var dbhost = process.env.OPENSHIFT_MONGODB_DB_HOST;
console.log('host:' + dbhost);
var dbport = process.env.OPENSHIFT_MONGODB_DB_PORT;
console.log('port:' + dbport);
var dbname = process.env.OPENSHIFT_APP_NAME;
console.log('dbname:' + dbname);
var dbuser = process.env.OPENSHIFT_MONGODB_DB_USERNAME;
console.log('user:' + dbuser);
var dbpass = process.env.OPENSHIFT_MONGODB_DB_PASSWORD;
console.log('pass:' + dbpass);

mongoose.connect('mongodb://' + dbuser + ':' + dbpass + '@' + dbhost + ':' + dbport + '/' + dbname, function(err){
	if(err){
		console.log('*******************there was a problem !!!');
		console.log(err);
	} else {
		console.log('Connected to the MongoDB...');
	}
});

//create a schema
var chatSchema = mongoose.Schema({
	nick: String,
	msg: String,
	created: {type: Date, default: Date.now}
});

//create model
var Chat = mongoose.model('Message', chatSchema);

app.get('/', function(req, res){
	//console.log(' the __dirname is:'+ __dirname);
	res.sendfile(__dirname+'/index.html');
});

io.sockets.on('connection', function(socket){
	var query = Chat.find({});
	query.sort('-created').limit(8).exec(function(err, docs){
		if(err){
			throw err;
		}
		console.log('Sending the old messages');
		socket.emit('load old msgs', docs);
	});	
	
	
	socket.on('new user', function(data, callback){
		//if (nicknames.indexOf(data) != -1){ //checking if the data is within the nicknames array
		if (data in users){
			callback(false);
		} else {
			callback(true);
			socket.nickname = data;
			//nicknames.push(socket.nickname);//old way
			users[socket.nickname] = socket;//new way
			updateNicknames();
		}
	});
	
	function updateNicknames(){
		io.sockets.emit('usernames', Object.keys(users));
	}

	socket.on('send message', function(data, callback){
		var msg = data.trim();
		if(msg.substr(0,3) === '/w '){
			msg = msg.substr(3);
			var ind = msg.indexOf(' ');
			if (ind !== -1){
				var name = msg.substring(0, ind);
				var msg = msg.substring(ind+1);
				if (name in users){
					users[name].emit('whisper', {msg: msg, nick: socket.nickname});
					console.log('This is a whisper' + msg);
				} else {
					callback('Error! enter a valid user!');
				}
			} else {
				callback('Error! Please enter a message for your wisper');
			}
		} else {
			var newMsg = new Chat({msg: msg, nick: socket.nickname});
			console.log('the msg is:' + msg);
			newMsg.save(function(err){
				if(err) {
					console.log('---problem here---'+err);
					throw err;
				}
				//io.sockets.emit('new message', data); //this is the first way of doing it
				io.sockets.emit('new message', {msg: msg, nick: socket.nickname});
			});
		}
	});
	
	socket.on('disconnect', function(data){
		if(!socket.nickname) return; //if no nickname yet selected then return
		// remove the element from the array
		//nicknames.splice(nicknames.indexOf(socket.nickname),1);
		delete users[socket.nickname];
		updateNicknames();
	});
});
