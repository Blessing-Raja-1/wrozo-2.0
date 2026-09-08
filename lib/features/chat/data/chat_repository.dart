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
        .snapshots()
        .map((snapshot) {
          final list = snapshot.docs.map((doc) => Conversation.fromMap(doc.id, doc.data())).toList();
          list.sort((a, b) {
            final aTime = a.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            final bTime = b.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
            return bTime.compareTo(aTime);
          });
          return list;
        });
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
    String? applicationId,
  }) async {
    final cleanText = text.trim();
    if (cleanText.isEmpty) {
      throw ArgumentError('Message text cannot be empty');
    }
    if (cleanText.length > 5000) {
      throw ArgumentError('Message text exceeds maximum length of 5000 characters');
    }

    final conversationId = generateConversationId(currentUserId, peerId);
    final convRef = _firestore.collection('conversations').doc(conversationId);
    final convSnap = await convRef.get();

    if (!convSnap.exists) {
      // First message flow: Must establish parent conversation first
      String? resolvedAppId = applicationId;
      if (resolvedAppId == null || resolvedAppId.isEmpty) {
        // Query accepted application where current user is worker and peer is contractor
        final asWorker = await _firestore
            .collection('applications')
            .where('workerId', isEqualTo: currentUserId)
            .where('contractorId', isEqualTo: peerId)
            .where('status', isEqualTo: 'ACCEPTED')
            .limit(1)
            .get();

        if (asWorker.docs.isNotEmpty) {
          resolvedAppId = asWorker.docs.first.id;
        } else {
          // Query accepted application where current user is contractor and peer is worker
          final asContractor = await _firestore
              .collection('applications')
              .where('workerId', isEqualTo: peerId)
              .where('contractorId', isEqualTo: currentUserId)
              .where('status', isEqualTo: 'ACCEPTED')
              .limit(1)
              .get();

          if (asContractor.docs.isNotEmpty) {
            resolvedAppId = asContractor.docs.first.id;
          }
        }
      }

      if (resolvedAppId == null || resolvedAppId.isEmpty) {
        throw StateError('Cannot start conversation: No accepted job application exists between these users.');
      }

      final sortedParticipants = [currentUserId, peerId]..sort();

      // Create conversation document first so subcollection security rules can verify parent doc
      await convRef.set({
        'participants': sortedParticipants,
        'applicationId': resolvedAppId,
        'createdAt': FieldValue.serverTimestamp(),
        'lastMessage': cleanText,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadCount': {
          currentUserId: 0,
          peerId: 1,
        },
      });

      // Insert first message in subcollection
      final msgRef = convRef.collection('messages').doc();
      final message = Message(
        id: msgRef.id,
        senderId: currentUserId,
        text: cleanText,
        createdAt: DateTime.now(),
        isRead: false,
      );
      await msgRef.set(message.toMap());
    } else {
      // Subsequent message flow: conversation already exists
      final msgRef = convRef.collection('messages').doc();
      final message = Message(
        id: msgRef.id,
        senderId: currentUserId,
        text: cleanText,
        createdAt: DateTime.now(),
        isRead: false,
      );

      final batch = _firestore.batch();
      batch.set(msgRef, message.toMap());
      // Crucial: Update only metadata; do NOT include 'participants', 'applicationId', or 'createdAt'
      batch.update(convRef, {
        'lastMessage': cleanText,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'unreadCount.$peerId': FieldValue.increment(1),
        'unreadCount.$currentUserId': 0,
      });
      await batch.commit();
    }
  }

  Future<void> markConversationAsRead(String conversationId, String currentUserId) async {
    final convRef = _firestore.collection('conversations').doc(conversationId);
    final convSnap = await convRef.get();
    if (!convSnap.exists) return;

    await convRef.update({
      'unreadCount.$currentUserId': 0,
    });
  }
}
