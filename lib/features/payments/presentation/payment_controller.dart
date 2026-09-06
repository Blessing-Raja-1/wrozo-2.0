import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../authentication/data/auth_repository.dart';
import '../data/payment_repository.dart';
import '../domain/payment.dart';

final paymentControllerProvider = NotifierProvider.autoDispose<PaymentController, AsyncValue<void>>(() {
  return PaymentController();
});

class PaymentController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  Future<void> payWorker({
    required String jobId,
    required String workerId,
    required int amount,
  }) async {
    final user = ref.read(authStateProvider).value;
    if (user == null) {
      state = AsyncError(Exception("Not authenticated"), StackTrace.current);
      return;
    }

    state = const AsyncLoading();
    try {
      final payment = Payment(
        id: '',
        jobId: jobId,
        workerId: workerId,
        contractorId: user.uid,
        amount: amount,
      );
      
      await ref.read(paymentRepositoryProvider).initiatePayment(payment).then((_) {});
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
