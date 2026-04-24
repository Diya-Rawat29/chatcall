# Product Requirements Document (PRD)

## 1. Product Overview
**InstaChat** is a full-featured real-time social communication application that blends the core functionalities of WhatsApp and Instagram. Users can send and receive connection requests, chat with text and multimedia, make voice and video calls, and share status stories that disappear after 24 hours. The goal is to provide a seamless, real-time, and engaging social chat experience.

## 2. Target Objectives
- Provide a robust authentication and connection-based user discovery system.
- Enable high-quality, real-time messaging, including group collaborations.
- Deliver low-latency voice and video calling features.
- Offer social-media style interactions like stories/status, reactions, and online presence indicators.

## 3. Technology Stack
- **Frontend**: Next.js + Tailwind CSS
- **Backend**: Node.js + Express
- **Real-time Engine**: Socket.IO
- **Database & Auth**: Firebase (Firebase Auth, Firestore Database, Firebase Storage)
- **Calling / Peer-to-Peer**: WebRTC
- **Push Notifications**: Firebase Cloud Messaging (FCM)

## 4. Core Features

### 4.1 Authentication & User Profiles
- Email/Password and Google Sign-In via Firebase Auth.
- Customizable user profiles containing avatars, names, and presence states.

### 4.2 User Connection System
- Granular capability to search for other users.
- Connect via a request mechanism (Send, Accept, Reject, Cancel).
- **Rules**: 
  - Chat/call functionality is disabled until a connection request is bilaterally accepted.
  - Duplicate requests are strictly prevented.
  - Granular privacy controls (Block Users to immediately stop interactions).

### 4.3 Real-time Messaging & Group Chats
- Real-time 1-on-1 and Group Chat (Group creation, admin controls).
- Typing indicators and Last Seen / Online status.
- Rich media sharing (Images, Videos, Documents).
- **Message Options**: Reply to specific messages, forward, delete for everyone, and emoji reactions.

### 4.4 Voice & Video Calling
- High-quality 1-on-1 voice calling.
- Integrated video calling leveraging WebRTC and device cameras.
- Comprehensive call states: ringing, accepted, rejected, ended.

### 4.5 Status / Stories
- Ability to upload temporary photos and video updates.
- Auto-deletion of media stories after exactly 24 hours.

### 4.6 Additional Capabilities
- Voice message recording and playback natively on the interface.
- Push Notifications on new messages or requests via FCM.
- Persistent Dark Mode support.

---

## 5. System Architecture
1. **Frontend**: Next.js drives the responsive PWA/Web interface.
2. **Backend Services**: Node.js works via Socket.IO to manage "Business Logic & Signaling" representing real-time communication events.
3. **Database & Object Storage**: Firestore acts as the primary document layer, while Firebase Storage retains heavy files.
4. **Peer Connection layer**: WebRTC bypasses standard routing to establish a direct Peer-to-Peer connection for Video/Voice after initial Socket.IO signaling.

---

## 6. Database schema (Firestore)

### `users` Collection
- `uid` (string)
- `name` (string)
- `email` (string)
- `photoURL` (string)
- `status` (string: "online", "offline")
- `lastSeen` (timestamp)
- `connections` (array: ["uid1", "uid2"])

### `requests` Collection
- `senderId` (string)
- `receiverId` (string)
- `status` (string: "pending" | "accepted" | "rejected")
- `createdAt` (timestamp)

### `messages` Collection
- `senderId` (string)
- `receiverId` (string)
- `text` (string)
- `type` (string: "text" | "image" | "audio" | "video")
- `mediaUrl` (string - optional)
- `replyTo` (string - optional messageId)
- `createdAt` (timestamp)

### `groups` Collection
- `groupId` (string)
- `groupName` (string)
- `groupIcon` (string)
- `admin` (string)
- `members` (array of uids)
- `createdAt` (timestamp)

### `groupMessages` Collection
- `groupId` (string)
- `senderId` (string)
- `text` (string)
- `type` (string: "text" | "image" | "audio" | "video")
- `mediaUrl` (string - optional)
- `createdAt` (timestamp)

### `status` Collection
- `userId` (string)
- `mediaUrl` (string)
- `type` (string: "image" | "video")
- `createdAt` (timestamp)
- `expiresAt` (timestamp - 24 hours later)

---

## 7. APIs & Events

### Core APIs (Firebase)
- Authentication API (Signups, Verifications)
- Firestore API (Snapshots, Queries)
- Storage API (Media handling)
- Cloud Messaging / FCM (Push notifications)

### Socket.IO Events
- `connection` / `disconnect`
- `sendMessage` / `receiveMessage`
- `typing`
- `callUser` / `acceptCall` / `rejectCall` / `endCall`
- `userOnline` / `userOffline`

### WebRTC Methods
- `getUserMedia()`
- `RTCPeerConnection`
- `createOffer()` / `createAnswer()`
- `setLocalDescription()` / `setRemoteDescription()`
- `addIceCandidate()`

---

## 8. Development Roadmap (Timeline)

- **Phase 1 (Week 1): Setup & Authentication**
  - Project initialization (Next.js + Node.js)
  - Firebase structural setup
  - User profiles and Email/Google Login implementations

- **Phase 2 (Week 2): Chat Core**
  - Foundational real-time text chat
  - Typing indicators
  - Online and Last Seen features

- **Phase 3 (Week 3): Connection System**
  - Ability to search global users
  - Push / Pull mechanisms for friend requests (Send, Accept, Reject)
  - Finalized connections list view

- **Phase 4 (Week 4): Voice Features**
  - Audio Voice messaging (Record & Play)
  - Functional 1-on-1 Voice Calling (WebRTC Integration)

- **Phase 5 (Week 5): Advanced Features**
  - Group Chat architecture and views
  - 24-hr Status/Stories pipeline
  - Push notifications configuration

- **Phase 6 (Week 6): Scalability & Polish**
  - Full Video Calling features
  - Message Action behaviors (Reply, Forward, Delete, Reactions)
  - High-level Privacy (Blocking)
  - End-to-end testing and production deployment

---
## 9. User Experience Flow (Quick Guide)
1. **Create Account / Login**: Standard or Google authentication screen.
2. **Search Users**: Intuitive search bar targeting profile names or emails.
3. **Send / Accept Connection**: Review incoming requests seamlessly in a dedicated list.
4. **Chatting Layer**: Enter active conversations immediately when a request bonds.
5. **Calls**: High fidelity UI popups intercepting screen for incoming or outgoing calls.
6. **Status Screen**: Swipable, vanishing updates at the top of a connections dashboard.
7. **Group Interaction**: Unified interface separating group dialogs efficiently.
