const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Health check for Render
app.get('/', (req, res) => res.send('InstaChat Socket Server is running ✅'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN,
    methods: ["GET", "POST"]
  }
});

let onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('setup', (userData) => {
    socket.join(userData.uid);
    onlineUsers.set(userData.uid, socket.id);
    socket.emit('connected');
    io.emit('user-online', userData.uid);
  });

  socket.on('join-chat', (room) => {
    socket.join(room);
    console.log('User Joined Room:', room);
  });

  socket.on('typing', (room) => socket.in(room).emit('typing'));
  socket.on('stop-typing', (room) => socket.in(room).emit('stop-typing'));

  socket.on('new-message', (newMessageReceived) => {
    const { roomId } = newMessageReceived;
    if (!roomId) return console.log('roomId not defined');
    
    // Broadcast to everyone else in the room
    socket.in(roomId).emit('message-received', newMessageReceived);
  });

  // WebRTC Signaling
  socket.on('call-user', (data) => {
    // Emit to the UID room of the callee
    socket.in(data.userToCall).emit('incoming-call', {
      signal: data.signal,
      from: data.from,
      name: data.name,
      callType: data.callType
    });
  });

  socket.on('answer-call', (data) => {
    socket.in(data.to).emit('call-accepted', { signal: data.signal });
  });

  socket.on('ice-candidate', (data) => {
    socket.in(data.to).emit('ice-candidate', { candidate: data.candidate });
  });

  socket.on('call-ended', (data) => {
    socket.in(data.to).emit('call-ended');
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected');
    let disconnectedUid = null;
    onlineUsers.forEach((socketId, uid) => {
        if(socketId === socket.id) disconnectedUid = uid;
    });
    if(disconnectedUid) {
        onlineUsers.delete(disconnectedUid);
        io.emit('user-offline', disconnectedUid);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
