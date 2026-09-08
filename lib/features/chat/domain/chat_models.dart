import 'package:cloud_firestore/cloud_firestore.dart';

class Conversation {
  final String id;
  final List<String> participants;
  final String applicationId;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final Map<String, int> unreadCount;

  Conversation({
    required this.id,
    required this.participants,
    this.applicationId = '',
    this.lastMessage = '',
    this.lastMessageAt,
    this.unreadCount = const {},
  });

  factory Conversation.fromMap(String id, Map<String, dynamic> data) {
    return Conversation(
      id: id,
      participants: List<String>.from(data['participants'] ?? []),
      applicationId: data['applicationId'] as String? ?? '',
      lastMessage: data['lastMessage'] as String? ?? '',
      lastMessageAt: (data['lastMessageAt'] as Timestamp?)?.toDate(),
      unreadCount: Map<String, int>.from(data['unreadCount'] ?? {}),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'participants': participants,
      'applicationId': applicationId,
      'lastMessage': lastMessage,
      'lastMessageAt': lastMessageAt == null ? FieldValue.serverTimestamp() : Timestamp.fromDate(lastMessageAt!),
      'unreadCount': unreadCount,
    };
  }
}

class Message {
  final String id;
  final String senderId;
  final String text;
  final DateTime? createdAt;
  final bool isRead;

  Message({
    required this.id,
    required this.senderId,
    required this.text,
    this.createdAt,
    this.isRead = false,
  });

  factory Message.fromMap(String id, Map<String, dynamic> data) {
    return Message(
      id: id,
      senderId: data['senderId'] as String? ?? '',
      text: data['text'] as String? ?? '',
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      isRead: data['isRead'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'senderId': senderId,
      'text': text,
      'createdAt': createdAt == null ? FieldValue.serverTimestamp() : Timestamp.fromDate(createdAt!),
      'isRead': isRead,
    };
  }
}
