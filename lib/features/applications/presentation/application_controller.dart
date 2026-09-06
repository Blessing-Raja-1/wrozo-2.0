import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../authentication/data/auth_repository.dart';
import '../data/application_repository.dart';
import '../domain/application.dart';
import '../../jobs/domain/job.dart';

final applicationControllerProvider = NotifierProvider.autoDispose<ApplicationController, AsyncValue<void>>(() {
  return ApplicationController();
});

class ApplicationController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> applyForJob(Job job) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    state = const AsyncLoading();
    try {
      final app = Application(
        id: '',
        jobId: job.id,
        workerId: user.uid,
        contractorId: job.contractorId,
        status: ApplicationStatus.pending,
      );
      await ref.read(applicationRepositoryProvider).applyForJob(app);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> acceptApplication(Application app) async {
    state = const AsyncLoading();
    try {
      await ref.read(applicationRepositoryProvider).updateApplicationStatus(app.id, ApplicationStatus.accepted);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }

  Future<void> rejectApplication(Application app) async {
    state = const AsyncLoading();
    try {
      await ref.read(applicationRepositoryProvider).updateApplicationStatus(app.id, ApplicationStatus.rejected);
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
