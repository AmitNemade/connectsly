import React, { Component } from 'react'
import io from 'socket.io-client'
import faker from "faker"

import {IconButton, Badge, Input, Button} from '@material-ui/core'
import VideocamIcon from '@material-ui/icons/Videocam'
import VideocamOffIcon from '@material-ui/icons/VideocamOff'
import MicIcon from '@material-ui/icons/Mic'
import MicOffIcon from '@material-ui/icons/MicOff'
import ScreenShareIcon from '@material-ui/icons/ScreenShare'
import StopScreenShareIcon from '@material-ui/icons/StopScreenShare'
import CallEndIcon from '@material-ui/icons/CallEnd'
import ChatIcon from '@material-ui/icons/Chat'

import { message } from 'antd'
import 'antd/dist/antd.css'
import { Row } from 'reactstrap'
import Modal from 'react-bootstrap/Modal'
import 'bootstrap/dist/css/bootstrap.css'
import "./Video.css"

const server_url = process.env.NODE_ENV === 'production' ? 'https://connectsly.herokuapp.com/' : "http://localhost:4001"

var connections = {}
var dataChannel = {}
var receiveBuffer = []
var receivedSize = 0

const peerConnectionConfig = {
	'iceServers': [
		{ urls: 'stun:stun.l.google.com:19302' },
		{ urls: 'stun:global.stun.twilio.com:3478?transport=udp' },
		{ urls: 'stun:stun.services.mozilla.com' },
	]
}
var socket = null
var socketId = null
var elms = 0

class Video extends Component {
	constructor(props) {
		super(props)

		this.localVideoref = React.createRef()

		this.videoAvailable = false
		this.audioAvailable = false

		this.state = {
			video: false,
			audio: false,
			screen: false,
			showModal: false,
			screenAvailable: false,
			messages: [],
			message: "",
			files: [],
			file: [],
			newmessages: 0,
			askForUsername: true,
			username: faker.internet.userName(),
		}
		connections = {}

		this.fileRef = React.createRef();

		this.getPermissions()
	}

	// Gets persmission on load and starts the video
	getPermissions = async () => {
		try{
			await navigator.mediaDevices.getUserMedia({ video: true })
				.then(() => this.videoAvailable = true)
				.catch(() => this.videoAvailable = false)

			await navigator.mediaDevices.getUserMedia({ audio: true })
				.then(() => this.audioAvailable = true)
				.catch(() => this.audioAvailable = false)

			if (navigator.mediaDevices.getDisplayMedia) {
				this.setState({ screenAvailable: true })
			} else {
				this.setState({ screenAvailable: false })
			}

			if (this.videoAvailable || this.audioAvailable) {
				navigator.mediaDevices.getUserMedia({ video: this.videoAvailable, audio: this.audioAvailable })
					.then((stream) => {
						window.localStream = stream
						this.localVideoref.current.srcObject = stream
					})
					.then((stream) => {})
					.catch((e) => console.log(e))
			}
		} catch(e) { console.log(e) }
	}

	// update the video and audio availability state of user and connects him to socket server
	getMedia = () => {
		this.setState({
			video: this.videoAvailable,
			audio: this.audioAvailable
		}, () => {
			this.getUserMedia()
			this.connectToSocketServer()
		})
	}

	// gets stream with new audio video condition 
	getUserMedia = () => {
		if ((this.state.video && this.videoAvailable) || (this.state.audio && this.audioAvailable)) {
			navigator.mediaDevices.getUserMedia({ video: this.state.video, audio: this.state.audio })
				.then(this.getUserMediaSuccess)
				.then((stream) => {})
				.catch((e) => console.log(e))
		} else {
			try {
				let tracks = this.localVideoref.current.srcObject.getTracks()
				tracks.forEach(track => track.stop())
			} catch (e) {}
		}
	}

	// updates everyones stream once user stream is updated
	getUserMediaSuccess = (stream) => {
		try {
			window.localStream.getTracks().forEach(track => track.stop())
		} catch(e) { console.log(e) }

		window.localStream = stream
		this.localVideoref.current.srcObject = stream

		for (let socketListId in connections) {
			if (socketListId === socketId) continue

			connections[socketListId].addStream(window.localStream)

			connections[socketListId].createOffer().then((description) => {
				console.log(1, description)
				connections[socketListId].setLocalDescription(description)
					.then(() => {
						socket.emit('signal', socketListId, JSON.stringify({ 'sdp': connections[socketListId].localDescription }))
					})
					.catch(e => console.log(2, description, e))
			})
		}

		// for (let socketListId in connections) {
			
		// }
		stream.getVideoTracks()[0].onended = () => {
			this.setState({
				video: false,
				audio: false,
			}, () => {
				try {
					let tracks = this.localVideoref.current.srcObject.getTracks()
					tracks.forEach(track => track.stop())
				} catch(e) { console.log(e) }

				let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
				window.localStream = blackSilence()
				this.localVideoref.current.srcObject = window.localStream

				for (let id in connections) {
					connections[id].addStream(window.localStream)

					connections[id].createOffer().then((description) => {
						console.log(description)
						connections[id].setLocalDescription(description)
							.then(() => {
								socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
							})
							.catch(e => console.log(e))
					})
				}
			})
		}
	}


	// gets screenshare stream 
	getDislayMedia = () => {
		if (this.state.screen) {
			if (navigator.mediaDevices.getDisplayMedia) {
				navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
					.then(this.getDislayMediaSuccess)
					.then((stream) => {})
					.catch((e) => console.log(e))
			}
		}
	}

	// send screenshare stream of user to everyone
	getDislayMediaSuccess = (stream) => {
		try {
			window.localStream.getTracks().forEach(track => track.stop())
		} catch(e) { console.log(e) }

		window.localStream = stream
		this.localVideoref.current.srcObject = stream

		for (let id in connections) {
			if (id === socketId) continue

			connections[id].addStream(window.localStream)

			connections[id].createOffer().then((description) => {
				connections[id].setLocalDescription(description)
					.then(() => {
						socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
					})
					.catch(e => console.log(e))
			})
		}

		stream.getVideoTracks()[0].onended = () => {
			this.setState({
				screen: false,
			}, () => {
				try {
					let tracks = this.localVideoref.current.srcObject.getTracks()
					tracks.forEach(track => track.stop())
				} catch(e) { console.log(e) }

				let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
				window.localStream = blackSilence()
				this.localVideoref.current.srcObject = window.localStream

				this.getUserMedia()
			})
		}
	}


	// 
	gotMessageFromServer = (fromId, message) => {
		var signal = JSON.parse(message)

		if (fromId !== socketId) {
			if (signal.sdp) {
				connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
					if (signal.sdp.type === 'offer') {
						connections[fromId].createAnswer().then((description) => {
							connections[fromId].setLocalDescription(description).then(() => {
								socket.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription }))
							}).catch(e => console.log(e))
						}).catch(e => console.log(e))
					}
				}).catch(e => console.log(e))
			}

			if (signal.ice) {
				connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
			}
		}
		connections[fromId].addEventListener('datachannel', event => {
			console.log("connect to senders data channel", event.channel, event.channel.binaryType)
			dataChannel[fromId] = event.channel;
			var arrayToStoreChunks = [];
			
			dataChannel[fromId].addEventListener('message', this.receiveDataChromeFactory()
			// function (event) {
			// 	var data = event.data;	

			// 	arrayToStoreChunks.push(data.message); // pushing chunks in array
			// 	console.log("receiving => ",dataChannel[fromId], data.message, arrayToStoreChunks)
			// 	if (data.last) {
			// 		this.saveToDisk(arrayToStoreChunks.join(''), 'fake fileName');
			// 		console.log(arrayToStoreChunks.join(''), 'fake fileName')
			// 		arrayToStoreChunks = []; // resetting array
			// 	}
			// }
			);
			// dataChannel[fromId].addEventListener('message', event => {
			// 	if(typeof(event.data) == "string"){
			// 		console.log(1, event.data)
			// 	}
			// 	else if(typeof(event.data) == "object"){
			// 		console.log(`Received Message ${event.data.byteLength}`);
			// 		receiveBuffer.push(event.data);
			// 		receivedSize += event.data.byteLength;

			// 		const file = this.state.file[0];
			// 		if (receivedSize === file.size) {
			// 		  const received = new Blob(receiveBuffer);
			// 		  receiveBuffer = [];
			// 		  console.log(received)
			// 		}
				  
			// 	}
			// });
		});
		
	}

	// handles video size according to number of members in meeting 
	changeCssVideos = (main) => {
		let widthMain = main.offsetWidth
		let minWidth = "30%"
		if ((widthMain * 30 / 100) < 300) {
			minWidth = "300px"
		}
		let minHeight = "40%"

		let height = String(100 / elms) + "%"
		let width = ""
		if (elms === 1 || elms === 2) {
			width = "45%"
			height = "100%"
		} else if (elms === 3 || elms === 4) {
			width = "35%"
			height = "50%"
		} else {
			width = String(100 / elms) + "%"
		}

		let videos = main.querySelectorAll("video")
		for (let a = 0; a < videos.length; ++a) {
			videos[a].style.minWidth = minWidth
			videos[a].style.minHeight = minHeight
			videos[a].style.setProperty("width", width)
			videos[a].style.setProperty("height", height)
		}

		return {minWidth, minHeight, width, height}
	}


	// Connects user to socket server
	connectToSocketServer = () => {
		socket = io.connect(server_url, { secure: true })

		socket.on('signal', this.gotMessageFromServer)

		socket.on('connect', () => {
			socket.emit('join-call', window.location.href)
			socketId = socket.id

			socket.on('chat-message', this.addMessage)	
			

			socket.on('user-left', (id) => {
				let video = document.querySelector(`[data-socket="${id}"]`)
				if (video !== null) {
					elms--
					video.parentNode.removeChild(video)

					let main = document.getElementById('main')
					this.changeCssVideos(main)
				}
			})

			socket.on('user-joined', (id, clients) => {
				console.log(id, clients)
				clients.forEach((socketListId) => {
					connections[socketListId] = undefined
					if (connections[socketListId] === undefined) {
						connections[socketListId] = new RTCPeerConnection(peerConnectionConfig
						// 	, {
						// 	optional: [{
						// 	  RtpDataChannels: true
						// 	}]
						//   }
						  )

						

						// Wait for their ice candidate       
						connections[socketListId].onicecandidate = function (event) {
							if (event.candidate != null) {
								socket.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate }))
							}
						}

						// Wait for their video stream
						connections[socketListId].onaddstream = (event) => {
							// TODO mute button, full screen button
							var searchVidep = document.querySelector(`[data-socket="${socketListId}"]`)
							if (searchVidep !== null) { // if i don't do this check it make an empyt square
								console.log("1")
								searchVidep.srcObject = event.stream
							} else {
								// console.log("2")
								elms = clients.length
								let main = document.getElementById('main')
								let cssMesure = this.changeCssVideos(main)

								let video = document.createElement('video')

								let css = {minWidth: cssMesure.minWidth, minHeight: cssMesure.minHeight, maxHeight: "100%", margin: "10px",
									borderStyle: "solid", borderColor: "#bdbdbd", objectFit: "fill"}
								for(let i in css) video.style[i] = css[i]

								video.style.setProperty("width", cssMesure.width)
								video.style.setProperty("height", cssMesure.height)
								video.setAttribute('data-socket', socketListId)
								video.srcObject = event.stream
								video.autoplay = true
								video.playsinline = true

								main.appendChild(video)
							}
						}

						// Add the local video stream
						if (window.localStream !== undefined && window.localStream !== null) {
							connections[socketListId].addStream(window.localStream)
						} else {
							let blackSilence = (...args) => new MediaStream([this.black(...args), this.silence()])
							window.localStream = blackSilence()
							connections[socketListId].addStream(window.localStream)
						}
					}
				})

				if (id !== socketId) {
					// Create an offer to connect with your local description
					connections[id].createOffer().then((description) => {
						connections[id].setLocalDescription(description)
							.then(() => {
								socket.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription }))
							})
							.catch(e => console.log(e))
					})
					
					dataChannel[id] = connections[id].createDataChannel("datachannel")
					dataChannel[id].addEventListener('open', event => {
						var readyState = dataChannel[id].readyState;
						console.log('Send channel state is: ' + readyState);
						dataChannel[id].send("Hello")
					});

					// Disable input when closed
					dataChannel[id].addEventListener('close', event => {
						var readyState = dataChannel[id].readyState;
						console.log('Send channel state is: ' + readyState);
					});

					
			
					dataChannel[id].onmessage = this.receiveDataChromeFactory()
					// function (event) {
					// 	var data = event.data;
		
					// 	arrayToStoreChunks.push(data.message); // pushing chunks in array
					// 	console.log("receiving => ", data.message, dataChannel[id])
					// 	console.log("From DataChannel: " + JSON.stringify(event.data)); 
					// 	console.log("From DataChannel: ", event.data);
					// 	if (data.last) {
					// 		this.saveToDisk(arrayToStoreChunks.join(''), 'fake fileName');
					// 		console.log(arrayToStoreChunks.join(''), 'fake fileName')
					// 		arrayToStoreChunks = []; // resetting array
					// 	}
					// };

					// Append new messages to the box of incoming messages
					// dataChannel[id].addEventListener('message', event => {
					// 	console.log(event.data)
					// 	if(typeof(event.data) == "string"){
					// 		console.log(1, event.data)
					// 	}
					// 	else if(typeof(event.data) == "object"){
					// 		console.log(`Received Message ${event.data.byteLength}`);
					// 		receiveBuffer.push(event.data);
					// 		receivedSize += event.data.byteLength;
		
					// 		const file = this.state.file[0];
					// 		if (receivedSize === file.size) {
					// 		  const received = new Blob(receiveBuffer);
					// 		  receiveBuffer = [];
					// 		  console.log(received)
					// 		}
						  
					// 	}
					// });
					
					// DataChannel
					// Enable textarea and button when opened
					
				}
			})
		})
	}

	silence = () => {
		let ctx = new AudioContext()
		let oscillator = ctx.createOscillator()
		let dst = oscillator.connect(ctx.createMediaStreamDestination())
		oscillator.start()
		ctx.resume()
		return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
	}
	black = ({ width = 640, height = 480 } = {}) => {
		let canvas = Object.assign(document.createElement("canvas"), { width, height })
		canvas.getContext('2d').fillRect(0, 0, width, height)
		let stream = canvas.captureStream()
		return Object.assign(stream.getVideoTracks()[0], { enabled: false })
	}

	// Play and Pause Video
	handleVideo = () => this.setState({ video: !this.state.video }, () => this.getUserMedia())
	
	// Mute and UnMute Video
	handleAudio = () => this.setState({ audio: !this.state.audio }, () => this.getUserMedia())
	
	// Start and Stops ScreenShare
	handleScreen = () => this.setState({ screen: !this.state.screen }, () => this.getDislayMedia())

	// Leave the meating
	handleEndCall = () => {
		try {
			let tracks = this.localVideoref.current.srcObject.getTracks()
			tracks.forEach(track => track.stop())
		} catch (e) {}
		window.location.href = "/"
	}

	// Open Chat Box
	openChat = () => this.setState({ showModal: true, newmessages: 0 })
	
	// Close Chat Box
	closeChat = () => this.setState({ showModal: false })
	
	// Updates current state of chat message that is typing
	handleMessage = (e) => this.setState({ message: e.target.value })

	// Handles when new message comes in chatbox
	addMessage = (data, sender, socketIdSender) => {
		this.setState(prevState => ({
			messages: [...prevState.messages, { "sender": sender, "data": data }],
		}))
		if (socketIdSender !== socketId) {
			this.setState({ newmessages: this.state.newmessages + 1 })
		}
	}

	receiveDataChromeFactory = () => {
		var buf, count;
		const saveToDisk = (arrayBuf, fileName) => {
			console.log("saving file")
			const blob = new Blob([arrayBuf]);
			// const fileName = `${filename}.${extension}`;
			if (navigator.msSaveBlob) {
				// IE 10+
				navigator.msSaveBlob(blob, fileName);
				console.log("download success IE 10+")
			} else {
				const link = document.createElement('a');
				// Browsers that support HTML5 download attribute
				if (link.download !== undefined) {
				  const url = URL.createObjectURL(blob);
				  link.setAttribute('href', url);
				  link.setAttribute('download', fileName);
				  link.style.visibility = 'hidden';
				  document.body.appendChild(link);
				  link.click();
				  document.body.removeChild(link);
				  console.log("download success chrome")
				}
				else{
					console.log("download fails chrome")
				}
			  }
		}
	  
		return function onmessage(event) {
		  if (typeof event.data === 'string') {
			buf = window.buf = new Uint8Array(parseInt(event.data));
			count = 0;
			console.log('Expecting a total of ' + buf.byteLength + ' bytes');
			return;
		  }
	  
		  var data = new Uint8Array(event.data);
		  buf.set(data, count);
	  
		  count += data.byteLength;
		  console.log('count: ' + count);
	  
		  if (count === buf.byteLength) {
			// we're done: all data chunks have been received
			console.log('Done. Rendering photo.');
			console.log(buf)
			
			saveToDisk(buf, "test.txt")
		  }
		  
		};
	}

	// Handles User Name Field value
	handleUsername = (e) => this.setState({ username: e.target.value })

	// Sends a chat message to everyone 
	sendMessage =async () => {
		socket.emit('chat-message', this.state.message, this.state.username)
		console.log("sending message...")

		var CHUNK_LEN = 4000;
		var file = this.state.file[0]
		var buffer = await file.arrayBuffer();
		var len = buffer.byteLength, n = len / CHUNK_LEN;
		// file.arrayBuffer()
		// 	.then(buf => {
		// 		console.log("success")
		// 		buffer = buf
		// 		len = buf.byteLength
		// 		n = len / CHUNK_LEN
		// 	})
		// 	.catch(err => console.log(err))

		var unit8array = new Uint8Array(buffer)

		

		console.log('Sending a total of ' + len + ' byte(s) => ' + n);
		for (let id in dataChannel) {
			dataChannel[id].send(len);
		}
	  
		// split the photo and send in chunks of about 64KB
		for (var i = 0; i < n; i++) {
		  var start = i * CHUNK_LEN,
			end = (i + 1) * CHUNK_LEN;
		  console.log(start + ' - ' + (end - 1));
		  for (let id in dataChannel) {
			  dataChannel[id].send(unit8array.subarray(start, end));
		  }
		}
	  
		// send the reminder, if any
		if (len % CHUNK_LEN) {
		  console.log('last ' + len % CHUNK_LEN + ' byte(s)');
		  for (let id in dataChannel) {
			  dataChannel[id].send(unit8array.subarray(n * CHUNK_LEN));
			}
		}


/********************************************************************** */
		// const onReadAsDataURL = (event, text) => {
		// 	console.log('FileRead.onload ', event, text );
		// 	var data = {}; // data object to transmit over data channel

		// 	if (event) text = event.target.result; // on first invocation

		// 	if (text.length > chunkLength) {
		// 		data.message = text.slice(0, chunkLength); // getting chunk using predefined chunk length
		// 	} else {
		// 		console.log("sending last")
		// 		data.message = text;
		// 		data.last = true;
		// 	}


		// 	for (let id in dataChannel) {
		// 		console.log("sending", data)
		// 		dataChannel[id].send(data); // use JSON.stringify for chrome!
		// 	}

		// 	var remainingDataURL = text.slice(data.message.length);
		// 	if (remainingDataURL.length) setTimeout(function () {
		// 		onReadAsDataURL(null, remainingDataURL); // continue transmitting
		// 	}, 500)
		// }

		// var chunkLength = 1000;
		// var file = this.state.file[0]
		// var reader = new window.FileReader();
		// reader.addEventListener('error', error => console.error('Error reading file:', error));
		// reader.addEventListener('abort', event => console.log('File reading aborted:', event));
		// reader.addEventListener('load', onReadAsDataURL);
		// reader.readAsArrayBuffer(file);
/********************************************************************** */

		// for (let id in dataChannel) {
		// 	console.log(dataChannel[id])
		// 	// dataChannel[id].readyState = "open" 
		// 	dataChannel[id].send(this.state.file[0])
			
		// }

		this.setState({ message: "", sender: this.state.username })
	}

	// Updates file variable with newly uploaded File
	handleFile = (e) => {	
		console.log("handleFile => ", e.target.files[0])
		this.setState({ file: e.target.files })
	}

	// Send the file
	sendFile = () => {
		// get the file to be sent
		var file = this.state.file[0];
		const chunkSize = 16384;
		var len = file.size;
		// var n = len / CHUNK_LEN | 0;

		console.log('Sending a total of ' + len + ' byte(s)');
		
		// Break it
		// Split the file and send in chunks of about 64KB
		
		let fileReader = new FileReader();
		let offset = 0;
		fileReader.addEventListener('error', error => console.error('Error reading file:', error));
		fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
		fileReader.addEventListener('load', e => {
		  console.log('FileRead.onload ', e);
		  for (let id in dataChannel) {
			  console.log(dataChannel[id].readyState)
			dataChannel[id].send(e.target.result);
		  }
		  offset += e.target.result.byteLength;
		  if (offset < file.size) {
			readSlice(offset);
		  }
		});
		const readSlice = o => {
		  console.log('readSlice ', o);
		  const slice = file.slice(offset, o + chunkSize);
		  fileReader.readAsArrayBuffer(slice);
		};
		readSlice(0);
		// this.setState({ file: []})
	}

	// Copies the link of the meeting
	copyUrl = () => {
		console.log(this.fileRef)
		let text = window.location.href
		if (!navigator.clipboard) {
			let textArea = document.createElement("textarea")
			textArea.value = text
			document.body.appendChild(textArea)
			textArea.focus()
			textArea.select()
			try {
				document.execCommand('copy')
				message.success("Link copied to clipboard!")
			} catch (err) {
				message.error("Failed to copy")
			}
			document.body.removeChild(textArea)
			return
		}
		navigator.clipboard.writeText(text).then(function () {
			message.success("Link copied to clipboard!")
		}, () => {
			message.error("Failed to copy")
		})
	}

	// Joins the meeting
	connect = () => this.setState({ askForUsername: false }, () => this.getMedia())

	
	isChromeOrFirefox = function() {
		let userAgent = (navigator && navigator.userAgent || '').toLowerCase()
		let vendor = (navigator && navigator.vendor || '').toLowerCase()
		let matchChrome = /google inc/.test(vendor) ? userAgent.match(/(?:chrome|crios)\/(\d+)/) : null
		let matchFirefox = userAgent.match(/(?:firefox|fxios)\/(\d+)/)
		return matchChrome !== null || matchFirefox !== null
	}

	render() {
		if(this.isChromeOrFirefox() === false){
			return (
				<div style={{background: "white", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
						textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"}}>
					<h1>Use Chrome or Firefox</h1>
				</div>
			)
		}
		return (
			<div>
				{this.state.askForUsername === true ?
					<div>
						<div style={{background: "white", width: "30%", height: "auto", padding: "20px", minWidth: "400px",
								textAlign: "center", margin: "auto", marginTop: "50px", justifyContent: "center"}}>
							<p style={{ margin: 0, fontWeight: "bold", paddingRight: "50px" }}>Set your username</p>
							<Input placeholder="Username" value={this.state.username} onChange={e => this.handleUsername(e)} />
							<Button variant="contained" color="primary" onClick={this.connect} style={{ margin: "20px" }}>Connect</Button>
						</div>

						<div style={{ justifyContent: "center", textAlign: "center", paddingTop: "40px" }}>
							<video id="my-video" ref={this.localVideoref} autoPlay muted style={{
								borderStyle: "solid",borderColor: "#bdbdbd",objectFit: "fill",width: "60%",height: "30%"}}></video>
						</div>
					</div>
					:
					<div>
						<div className="btn-down" style={{ backgroundColor: "whitesmoke", color: "whitesmoke", textAlign: "center" }}>
							<IconButton style={{ color: "#424242" }} onClick={this.handleVideo}>
								{(this.state.video === true) ? <VideocamIcon /> : <VideocamOffIcon />}
							</IconButton>

							<IconButton style={{ color: "#f44336" }} onClick={this.handleEndCall}>
								<CallEndIcon />
							</IconButton>

							<IconButton style={{ color: "#424242" }} onClick={this.handleAudio}>
								{this.state.audio === true ? <MicIcon /> : <MicOffIcon />}
							</IconButton>

							{this.state.screenAvailable === true ?
								<IconButton style={{ color: "#424242" }} onClick={this.handleScreen}>
									{this.state.screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
								</IconButton>
								: null}

							<Badge badgeContent={this.state.newmessages} max={999} color="secondary" onClick={this.openChat}>
								<IconButton style={{ color: "#424242" }} onClick={this.openChat}>
									<ChatIcon />
								</IconButton>
							</Badge>
						</div>

						<Modal show={this.state.showModal} onHide={this.closeChat} style={{ zIndex: "999999" }}>
							<Modal.Header closeButton>
								<Modal.Title>Chat Room</Modal.Title>
							</Modal.Header>
							<Modal.Body style={{ overflow: "auto", overflowY: "auto", height: "400px", textAlign: "left" }} >
								{this.state.messages.length > 0 ? this.state.messages.map((item, index) => (
									<div key={index} style={{textAlign: "left"}}>
										<p style={{ wordBreak: "break-all" }}><b>{item.sender}</b>: {item.data}</p>
									</div>
								)) : <p>No message yet</p>}
							</Modal.Body>
							<Modal.Footer className="div-send-msg">
								
							<div id="UploadBox">
								<span id='UploadArea'>
									<label htmlFor="FileBox">Choose A File: </label>
									<input type="file" id="FileBox" ref={this.fileRef} onChange={this.handleFile}></input>
									
						
									<button  type='button' id='UploadButton' className='Button' onClick={this.sendFile}>Send File</button>
								</span>
							</div>
								<Input placeholder="Message" value={this.state.message} onChange={e => this.handleMessage(e)} />
								<Button variant="contained" color="primary" onClick={this.sendMessage}>Send</Button>
							</Modal.Footer>
						</Modal>

						<div className="container">
							<div style={{ paddingTop: "20px" }}>
								<Input value={window.location.href} disable="true"></Input>
								<Button style={{backgroundColor: "#3f51b5",color: "whitesmoke",marginLeft: "20px",
									marginTop: "10px",width: "120px",fontSize: "10px"
								}} onClick={this.copyUrl}>Copy invite link</Button>
							</div>

							<Row id="main" className="flex-container" style={{ margin: 0, padding: 0 }}>
								<video id="my-video" ref={this.localVideoref} autoPlay muted style={{
									borderStyle: "solid",borderColor: "#bdbdbd",margin: "10px",objectFit: "fill",
									width: "100%",height: "100%"}}></video>
							</Row>
						</div>
					</div>
				}
			</div>
		)
	}
}

export default Video






















/************************************************ */
	// sendPhoto = () => {
	// 	console.log(this.fileRef.current, this.fileRef.current.files, this.fileRef.current.files[0] )
	// 	// Split data channel message in chunks of this byte length.
	// 	var CHUNK_LEN = 64000;
	// 	// var img = photoContext.getImageData(0, 0, photoContextW, photoContextH),
	// 	var img = this.fileRef.current.files[0],
	// 	  len = img.size,
	// 	  n = len / CHUNK_LEN | 0;
	  
	// 	console.log('Sending a total of ' + len + ' byte(s)');
	// 	if (!connections[socketId].createDataChannel('file-transfer')) {
	// 		console.log('Connection has not been initiated. ' +
	// 		  'Get two peers in the same room first');
	// 		return;
	// 	} else if (connections[socketId].createDataChannel('file-transfer').readyState === 'closed') {
	// 		console.log('Connection was lost. Peer closed the connection.');
	// 		return;
	// 	}
	// 	console.log(connections[socketId].createDataChannel('file-transfer'))

	// 	connections[socketId].createDataChannel('file-transfer').onopen = function(event) {
	// 		var readyState = connections[socketId].createDataChannel('file-transfer').readyState;
	// 		if (readyState == "open") {
				
	// 			connections[socketId].createDataChannel('file-transfer').send(len);
	// 		}
	// 	  };

	// 	// connections[socketId].createDataChannel('file-transfer').onopen = onSendChannelStateChange;
	// 	// connections[socketId].createDataChannel('file-transfer').onclose = onSendChannelStateChange;
	  
	// 	// split the photo and send in chunks of about 64KB
	// 	for (var i = 0; i < n; i++) {
	// 	  var start = i * CHUNK_LEN,
	// 		end = (i + 1) * CHUNK_LEN;
	// 	  console.log(start + ' - ' + (end - 1));
	// 	  connections[socketId].createDataChannel('file-transfer').send(img.size.subarray(start, end));
	// 	}
	  
		// // send the reminder, if any
		// if (len % CHUNK_LEN) {
		//   console.log('last ' + len % CHUNK_LEN + ' byte(s)');
		//   connections[socketId].createDataChannel('file-transfer').send(img.size.subarray(n * CHUNK_LEN));
		// }
	// }
	
	// receiveDataChromeFactory = () => {
	// 	var buf, count;
	  
	// 	return function onmessage(event) {
	// 	  if (typeof event.data === 'string') {
	// 		buf = window.buf = new Uint8ClampedArray(parseInt(event.data));
	// 		count = 0;
	// 		console.log('Expecting a total of ' + buf.byteLength + ' bytes');
	// 		return;
	// 	  }
	  
	// 	  var data = new Uint8ClampedArray(event.data);
	// 	  buf.set(data, count);
	  
	// 	  count += data.byteLength;
	// 	  console.log('count: ' + count);
	  
	// 	  if (count === buf.byteLength) {
	// 		// we're done: all data chunks have been received
	// 		console.log('Done. Rendering photo.');
	// 		this.renderPhoto(buf);
	// 	  }
	// 	};
	//   }
	  
	// renderPhoto = (data) => {
	// 	console.log(data)
	// 	// var canvas = document.createElement('canvas');
	// 	// canvas.width = photoContextW;
	// 	// canvas.height = photoContextH;
	// 	// canvas.classList.add('incomingPhoto');
	// 	// // trail is the element holding the incoming images
	// 	// trail.insertBefore(canvas, trail.firstChild);
	  
	// 	// var context = canvas.getContext('2d');
	// 	// var img = context.createImageData(photoContextW, photoContextH);
	// 	// img.data.set(data);
	// 	// context.putImageData(img, 0, 0);
	//   }

	// // snapPhoto = () => {
	// // 	photoContext.drawImage(video, 0, 0, photo.width, photo.height);
	// // 	show(photo, sendBtn);
	// //   }