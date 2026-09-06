import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/auth_repository.dart';

final authControllerProvider = NotifierProvider.autoDispose<AuthController, AsyncValue<void>>(() {
  return AuthController();
});

class AuthController extends AutoDisposeNotifier<AsyncValue<void>> {
  String? _verificationId;

  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> sendOTP(String phoneNumber, {required Function() onCodeSent}) async {
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).verifyPhone(
        phoneNumber: phoneNumber,
        codeSent: (verificationId) {
          _verificationId = verificationId;
          state = const AsyncData(null);
          onCodeSent();
        },
        verificationFailed: (FirebaseAuthException e) {
          state = AsyncError(e, StackTrace.current);
        },
      );
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> verifyOTP(String smsCode) async {
    if (_verificationId == null) {
      state = AsyncError(Exception("Verification ID is null. Try sending OTP again."), StackTrace.current);
      return;
    }
    
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).verifyOTP(_verificationId!, smsCode);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> setRole(String role) async {
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).setRole(role);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> signOut() async {
    state = const AsyncLoading();
    try {
      await ref.read(authRepositoryProvider).signOut();
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
