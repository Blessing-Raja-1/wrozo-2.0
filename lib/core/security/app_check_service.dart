import 'dart:developer' as developer;

import 'package:firebase_app_check/firebase_app_check.dart';
import 'package:flutter/foundation.dart';

/// App Check Service
///
/// Provides production-ready attestation for Wrozo 2.0 to protect backend
/// Cloud Functions and Firestore from unauthorized clients, scripts, and scraping.
///
/// Security Architecture Principles:
/// 1. Authentication (Firebase Auth) proves WHO the user is.
/// 2. Authorization (Firestore Rules & Cloud Functions) enforces WHAT the user can do.
/// 3. App Check verifies that incoming traffic originates from a genuine Wrozo app build.
/// 4. App Check NEVER replaces authentication or authorization.
///
/// Provider Selection:
/// - Production Android: Play Integrity (`AndroidProvider.playIntegrity`)
/// - Development / Emulator: Debug Provider (`AndroidProvider.debug`)
/// - Production iOS / macOS: App Attest (`AppleProvider.appAttestWithDeviceCheckFallback`)
/// - Development iOS: Debug Provider (`AppleProvider.debug`)
class AppCheckService {
  AppCheckService._();

  static bool _isInitialized = false;

  /// Returns whether App Check has been successfully initialized in this process.
  static bool get isInitialized => _isInitialized;

  /// Initializes Firebase App Check with the appropriate attestation provider.
  /// Safely catches platform-specific attestation failures so app startup is never blocked.
  static Future<void> initialize({
    bool? isDebugOverride,
  }) async {
    if (_isInitialized) {
      return;
    }

    final isDebug = isDebugOverride ?? kDebugMode;

    try {
      await FirebaseAppCheck.instance.activate(
        // ignore: deprecated_member_use
        androidProvider: isDebug
            ? AndroidProvider.debug
            : AndroidProvider.playIntegrity,
        // ignore: deprecated_member_use
        appleProvider: isDebug
            ? AppleProvider.debug
            : AppleProvider.appAttestWithDeviceCheckFallback,
      );

      _isInitialized = true;
      developer.log(
        'Firebase App Check initialized successfully (${isDebug ? "DEBUG" : "PLAY_INTEGRITY"})',
        name: 'AppCheckService',
      );
    } catch (e, stack) {
      // In development, emulators without Play Services, or environments without
      // Play Integrity attestation, log a warning without crashing the client app.
      developer.log(
        'Warning: Firebase App Check initialization failed: $e',
        name: 'AppCheckService',
        error: e,
        stackTrace: stack,
      );
    }
  }

  /// Fetches the current App Check token if available.
  static Future<String?> getToken({bool forceRefresh = false}) async {
    try {
      final token = await FirebaseAppCheck.instance.getToken(forceRefresh);
      return token;
    } catch (e) {
      developer.log('Failed to retrieve App Check token: $e', name: 'AppCheckService');
      return null;
    }
  }
}
