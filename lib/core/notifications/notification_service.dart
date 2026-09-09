import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Top-level background message handler invoked when the application
/// is in the background or terminated.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Authoritative background message handling
  if (kDebugMode) {
    debugPrint('Background message received: ${message.messageId}');
  }
}

/// Client-side notification service managing permissions, token registration,
/// and message streams.
class NotificationService {
  final FirebaseMessaging? _customMessaging;
  final FirebaseFirestore? _customFirestore;
  StreamSubscription<String>? _tokenRefreshSubscription;

  FirebaseMessaging get _messaging =>
      _customMessaging ?? FirebaseMessaging.instance;
  FirebaseFirestore get _firestore =>
      _customFirestore ?? FirebaseFirestore.instance;

  NotificationService({
    FirebaseMessaging? messaging,
    FirebaseFirestore? firestore,
  })  : _customMessaging = messaging,
        _customFirestore = firestore;

  /// Requests push notification permissions from the user.
  Future<NotificationSettings> requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    if (kDebugMode) {
      debugPrint('FCM Authorization status: ${settings.authorizationStatus}');
    }

    return settings;
  }

  /// Initializes messaging handlers for foreground, background, and app-opened events.
  Future<void> initialize({
    void Function(RemoteMessage message)? onNotificationOpened,
    void Function(RemoteMessage message)? onForegroundMessage,
  }) async {
    // Set background message handler
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    // Check for message that opened the app from terminated state
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      onNotificationOpened?.call(initialMessage);
    }

    // Handle notification clicks when the app is in the background
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      onNotificationOpened?.call(message);
    });

    // Handle messages received while the app is in the foreground
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      if (kDebugMode) {
        debugPrint('Foreground message received: ${message.notification?.title}');
      }
      onForegroundMessage?.call(message);
    });
  }

  /// Synchronizes device token with Firestore for the authenticated user.
  /// Enforces client ownership according to Firestore security rules.
  Future<void> syncDeviceToken(String userId) async {
    if (userId.isEmpty) return;

    try {
      final token = await _messaging.getToken();
      if (token == null || token.isEmpty) return;

      final sanitizedDocId = _sanitizeTokenDocId(token);
      final tokenRef = _firestore
          .collection('users')
          .doc(userId)
          .collection('device_tokens')
          .doc(sanitizedDocId);

      final userRef = _firestore.collection('users').doc(userId);

      final batch = _firestore.batch();
      batch.set(
        tokenRef,
        {
          'token': token,
          'platform': 'android',
          'updatedAt': FieldValue.serverTimestamp(),
        },
        SetOptions(merge: true),
      );

      batch.update(userRef, {
        'fcmTokens': FieldValue.arrayUnion([token]),
      });

      await batch.commit();

      if (kDebugMode) {
        debugPrint('FCM device token synchronized for user: $userId');
      }

      // Listen for token refreshes
      listenToTokenRefresh(userId);
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Failed to sync FCM device token: $e');
      }
    }
  }

  /// Unregisters the current device token upon user sign-out.
  Future<void> removeDeviceToken(String userId) async {
    if (userId.isEmpty) return;

    try {
      final token = await _messaging.getToken();
      if (token == null || token.isEmpty) return;

      final sanitizedDocId = _sanitizeTokenDocId(token);
      final tokenRef = _firestore
          .collection('users')
          .doc(userId)
          .collection('device_tokens')
          .doc(sanitizedDocId);

      final userRef = _firestore.collection('users').doc(userId);

      final batch = _firestore.batch();
      batch.delete(tokenRef);
      batch.update(userRef, {
        'fcmTokens': FieldValue.arrayRemove([token]),
      });

      await batch.commit();

      await _tokenRefreshSubscription?.cancel();
      _tokenRefreshSubscription = null;

      if (kDebugMode) {
        debugPrint('FCM device token removed for user: $userId');
      }
    } catch (e) {
      if (kDebugMode) {
        debugPrint('Failed to remove FCM device token: $e');
      }
    }
  }

  /// Listens for FCM token rotations and syncs new tokens automatically.
  void listenToTokenRefresh(String userId) {
    _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = _messaging.onTokenRefresh.listen((newToken) {
      if (kDebugMode) {
        debugPrint('FCM token refreshed, re-syncing');
      }
      syncDeviceToken(userId);
    });
  }

  /// Sanitizes token string to create a safe, valid Firestore document ID.
  String _sanitizeTokenDocId(String token) {
    final sanitized = token.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '');
    if (sanitized.length > 50) {
      return sanitized.substring(0, 50);
    }
    return sanitized.isNotEmpty ? sanitized : 'token_id';
  }

  /// Disposes active subscriptions.
  void dispose() {
    _tokenRefreshSubscription?.cancel();
    _tokenRefreshSubscription = null;
  }
}

/// Riverpod provider for [NotificationService].
final notificationServiceProvider = Provider<NotificationService>((ref) {
  final service = NotificationService();
  ref.onDispose(() => service.dispose());
  return service;
});
