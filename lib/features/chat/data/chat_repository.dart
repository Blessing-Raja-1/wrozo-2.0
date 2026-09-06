import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/chat_models.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(firestore: FirebaseFirestore.instance);
});

final userConversationsProvider = StreamProvider.family.autoDispose<List<Conversation>, String>((ref, userId) {
  return ref.watch(chatRepositoryProvider).watchUserConversations(userId);
});

final conversationMessagesProvider = StreamProvider.family.autoDispose<List<Message>, String>((ref, conversationId) {
  return ref.watch(chatRepositoryProvider).watchMessages(conversationId);
});

class ChatRepository {
  final FirebaseFirestore _firestore;

  ChatRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  String generateConversationId(String uid1, String uid2) {
    final uids = [uid1, uid2];
    uids.sort();
    return '${uids[0]}_${uids[1]}';
  }

  Stream<List<Conversation>> watchUserConversations(String userId) {
    return _firestore
        .collection('conversations')
        .where('participants', arrayContains: userId)
        .orderBy('lastMessageAt', descending: true)
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => Conversation.fromMap(doc.id, doc.data())).toList());
  }

  Stream<List<Message>> watchMessages(String conversationId) {
    return _firestore
        .collection('conversations')
        .doc(conversationId)
        .collection('messages')
        .orderBy('createdAt', descending: true) // Newest at the bottom of the list when reversed
        .snapshots()
        .map((snapshot) => snapshot.docs.map((doc) => Message.fromMap(doc.id, doc.data())).toList());
  }

  Future<void> sendMessage({
    required String currentUserId,
    required String peerId,
    required String text,
  }) async {
    final conversationId = generateConversationId(currentUserId, peerId);
    final convRef = _firestore.collection('conversations').doc(conversationId);
    final msgRef = convRef.collection('messages').doc();

    final message = Message(
      id: '',
      senderId: currentUserId,
      text: text,
      isRead: false,
    );

    // Using a batch to ensure conversation metadata updates atomically with the message insertion
    final batch = _firestore.batch();
    
    batch.set(msgRef, message.toMap());
    batch.set(convRef, {
      'participants': [currentUserId, peerId],
      'lastMessage': text,
      'lastMessageAt': FieldValue.serverTimestamp(),
      'unreadCount': {
        currentUserId: 0,
        peerId: FieldValue.increment(1),
      }
    }, SetOptions(merge: true));

    await batch.commit();
  }

  Future<void> markConversationAsRead(String conversationId, String currentUserId) async {
    await _firestore.collection('conversations').doc(conversationId).set({
      'unreadCount': {
        currentUserId: 0,
      }
    }, SetOptions(merge: true));
  }
}
