import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../authentication/data/auth_repository.dart';
import '../data/profile_repository.dart';
import '../domain/worker_profile.dart';
import '../domain/contractor_profile.dart';

final profileControllerProvider = NotifierProvider.autoDispose<ProfileController, AsyncValue<void>>(() {
  return ProfileController();
});

class ProfileController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> saveWorkerProfile(WorkerProfile profile) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    state = const AsyncLoading();
    try {
      await ref.read(profileRepositoryProvider).updateWorkerProfile(user.uid, profile.toMap());
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> saveContractorProfile(ContractorProfile profile) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    state = const AsyncLoading();
    try {
      await ref.read(profileRepositoryProvider).updateContractorProfile(user.uid, profile.toMap());
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
