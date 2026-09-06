import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../authentication/data/auth_repository.dart';
import '../data/chat_repository.dart';

final chatControllerProvider = NotifierProvider.autoDispose<ChatController, AsyncValue<void>>(() {
  return ChatController();
});

class ChatController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> sendMessage(String peerId, String text) async {
    if (text.trim().isEmpty) return;
    
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    try {
      await ref.read(chatRepositoryProvider).sendMessage(
        currentUserId: user.uid,
        peerId: peerId,
        text: text.trim(),
      );
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> markAsRead(String conversationId) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) return;
    try {
      await ref.read(chatRepositoryProvider).markConversationAsRead(conversationId, user.uid);
    } catch (_) {}
  }
}
