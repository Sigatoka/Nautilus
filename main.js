// Modules
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const fs = require('fs');
const binaryen = require('binaryen');
const colors = require('colors');
// EOS
const eosjs = require('eosjs');
const fetch = require('node-fetch');
const { TextDecoder, TextEncoder } = require('text-encoding');
// Cache
const ElectronStore = require('electron-store');
const createHash = require('create-hash');
const HASH_LENGTH = 8;

const store = new ElectronStore({
	name:'files',
	defaults:{}
});

const keys = ["EOS5vCdftk4hxj5ygrH6ZK8jkgoo1sm2JoppKvikATAN74b9Bfs2F"];
const HTTP_ENDPOINT = 'http://127.0.0.1:8888';
const CHAIN_ID = 'cf057bbfb72640471fd910bcb67639c22df9f92470936cddc1ade0e2f2e7dc4f';
const PRIVATE_KEYS = ["5JgyBhAvhfhH4Xo474EV1Zjm9uhEGjWXr62tj17aYUKR36ocWzY","5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3","5J5t5Xp9Ug4rwBLRZNLKyXCrAVBHAMWAXeZTgdHFW86BC3qCKbM","5Kay6rDnV1hjLQUwBeEPrfxMwYdAP3gwhLSkYmby7vd7jxGrfx8"];

/**
 * Key Provider
 * @desc Manages private and public keys for the network
 */
const signatureProvider = new eosjs.SignatureProvider(PRIVATE_KEYS);

/**
 * Connection
 * @desc Manages a JSON-RPC Connection
 */
const rpc = new eosjs.Rpc.JsonRpc(HTTP_ENDPOINT, { fetch });

/**
 * API
 * @desc API Constructor setup
 */
const eos = new eosjs.Api({
	rpc,
	signatureProvider,
	textDecoder: new TextDecoder(),
	textEncoder: new TextEncoder()
});

console.log(eos);
  
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow, watcher;

function createWindow () {
	// Create the browser window.
	mainWindow = new BrowserWindow({width:1000,height:700,minWidth:500,minHeight:600});

	// and load the index.html of the app.
	mainWindow.loadURL(`file://${__dirname}/public/index.html`);
	// Open the DevTools.
	mainWindow.webContents.openDevTools()


	// Emitted when the window is closed.
	mainWindow.on('closed', () => {
	  // Dereference the window object, usually you would store windows
	  // in an array if your app supports multi windows, this is the time
	  // when you should delete the corresponding element.
	  mainWindow = null
	})

	const menu = Menu.buildFromTemplate([
		{
			label:'Menu',
			submenu:[
				{label:'Environment'},
				{label:'Set Provider'}
			]
		}, {
			label:'Accounts',
			submenu:[
				{
					label:'Create'
				}, {
					label:'Keys',
					submenu:[
						{label:'Generate Private Key'},
						{label:'Generate Public Key'}
					]
				}
			]
		}, {
			label:'Contracts',
			submenu:[
				{label:'Scan'},
				{label:'Build'},
				{label:'Test'},
				{label:'Deploy'}
			]
		}, {
			label:'Transactions',
			submenu:[
				{label:'Create'},
				{label:'History'}
			]
		},
	]);

	Menu.setApplicationMenu(menu);

	watcher = chokidar.watch('/Users/mitch/Contracts/Nautilus/contracts', {
		ignored: /[\/\\]\./,
		persistent: true
	});

	function onWatcherReady() {
		console.info(colors.white('Chokidar is watching directory: /Users/mitch/Contracts/Nautilus/contracts'));
	}
	// Declare the listeners of the watcher
	watcher.on('add', function(path, { size, mtimeMS, birthtimeMs }) {

		const dirPattern = /(.*\/).*/gi;
		const pathComponents = dirPattern.exec(path);
		const fileComponents = path.replace(pathComponents[1],'').split('.');
		
		const dir = pathComponents[1];
		const name = fileComponents[0];
		const extension = fileComponents[1];
		const uid = generateUid(path);
		// Construct data
		const data = { uid, name, extension, path:dir, file:fileComponents.join('.'), size };
		if (mtimeMS) data.modified = mtimeMS;
		if (birthtimeMs) data.created = birthtimeMs;
		//store.set(fileComponents[0], existing);
		updateFile(uid, data);
	}).on('addDir', function(path) {
		//console.log('Directory', path, 'has been added');
	}).on('change', function(path) {
		const uid = generateUid(path);
		updateFile(uid, { modified:true });
		//mainWindow.webContents.send('file:changed', uid);
		//console.log(colors.cyan("Updated file"),colors.grey(path));
	}).on('unlink', function(path) {
		//mainWindow.webContents.send('file:removed', path);
		//console.log(colors.red("Removed file"),colors.grey(path));
		const uid = generateUid(path);
		store.delete(uid);
	}).on('unlinkDir', function(path) {
		//console.log(colors.red("Removed directory"),colors.grey(path));
	}).on('error', function(error) {
		//console.log('Error happened', error);
	}).on('ready', onWatcherReady);
}

function cleanse(obj, schema) {
	// Should cleanse data props
	return obj;
}

function updateFile(uid, data) {
	data = cleanse(data);
	const file = store.get(uid, DEFAULT_FILE_DATA);
	const merged = Object.assign(file, data);
	store.set(uid, merged);
}

const DEFAULT_FILE_DATA = {
	uid:'',
	name:'',
	extension:'',
	path:'',
	file:'',
	modified:false,
	created:false,
	size:0
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
	// On macOS it is common for applications and their menu bar
	// to stay active until the user quits explicitly with Cmd + Q
	if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
	// On macOS it's common to re-create a window in the app when the
	// dock icon is clicked and there are no other windows open.
	if (mainWindow === null) {
	  createWindow()
	}
});

/**
 * Executes simple shell command
 * @param {String} cmd
 * @return {Object} { stdout: String, stderr: String }
 */
async function execute(cmd) {
	return new Promise(function (resolve, reject) {
		exec(cmd, (err, stdout, stderr) => {
			if (err) {
				reject(err);
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

ipcMain.on('compile:file', (event, { input, output, type }) => {
	execute(`eosiocpp -${((type === 'wasm')?'o':'g')} ${output} ${input}`).then(({ stdout, stderr }) => {
		mainWindow.webContents.send('compile:complete', { input, output, type });
	}).catch((err) => {
		console.log(colors.red(err));
	});
});

ipcMain.on('deploy:contract', (event, { code, files }) => {

	const promises = files.map(({ type, fullPath }) => {
		
		if (type === 'wasm') {
			const file = fs.readFileSync(fullPath);
			return eos.setcode(code, 0, 0, file).then(receipt => {
				mainWindow.webContents.send('deploy:success', fullPath);
			}).catch(err => {
				const { code, message, error } = JSON.parse(err);
				if (error.code === 3160008) {
					mainWindow.webContents.send('deploy:success', fullPath);
				} else {
					console.log(colors.red("ERROR"),colors.yellow("("+code+" : "+message+")"),colors.grey("("+error.code+") "+error.what));
				}
			});
		} else if (type === 'abi') {
			const file = fs.readFileSync(fullPath);
			return eos.setabi(code, JSON.parse(file)).then(receipt => {
				mainWindow.webContents.send('deploy:success', fullPath);
			}).catch(err => {
				const { code, message, error } = JSON.parse(err);
				console.log(colors.red(code),colors.yellow(message),colors.grey(error.what));
			});
		} else {
			return false;
		}
	});

	Promise.all(promises).then((results) => {
		//console.log(results);
		mainWindow.webContents.send('deploy:complete', code);
	}).catch((err) => {
		const { code, message, error } = JSON.parse(err);
		console.log(colors.red(code),colors.yellow(message),colors.grey(error.what));
	});
});

ipcMain.on('directory:watch', (event, directory) => {

	const currentPaths = watcher.getWatched();
	console.log("Watching", Object.keys(currentPaths));
	watcher.unwatch(Object.keys(currentPaths));
	console.log("Cleared paths, add", directory)
	watcher.add(directory);
});

ipcMain.on('account:create', (event, name) => {

	const creator = "eosio";
	const ownerKey = keys[0];
	const activeKey = keys[0];

	eos.newaccount({
		creator: creator,
		name: name,
		owner: ownerKey,
		active: activeKey
	}, (error, receipt) => {
		if (error) {
			mainWindow.webContents.send('account:exists', name);
		} else {
			mainWindow.webContents.send('account:created', name);
		}
	});
});

ipcMain.on('account:load', (event, key) => {

	eos.getKeyAccounts(keys[0], (err, { account_names }) => {
		if (err) {
			console.log(colors.red("ERROR"),colors.grey(err));
		} else {
			mainWindow.webContents.send('accounts:loaded', account_names);
		}
	});
});

ipcMain.on('account:code', (event, name) => {
	eos.getCodeHash(name).then((account_name, code_hash) => {
		console.log(colors.grey("Name"),account_name);
		console.log(colors.cyan("Code"),code_hash);
	}).catch(error => {
		console.log(colors.red("ERROR"),colors.yellow(error));
	});
});

function generateUid(fullPath) {
	return createHash('sha256').update(fullPath).digest('hex').substr(0,HASH_LENGTH).toUpperCase();
}