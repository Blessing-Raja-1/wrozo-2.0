import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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

  // SEC-02: Client-initiated payment writes are permanently prohibited.
  // This method is retained so call sites compile, but invoking it will always produce
  // an error state. Payments must be processed via a server-side payment gateway.
  Future<void> payWorker({
    required String jobId,
    required String workerId,
    required int amount,
  }) async {
    state = const AsyncLoading();
    try {
      // The repository method throws UnsupportedError immediately (SEC-02).
      await ref.read(paymentRepositoryProvider).initiatePayment(
        Payment(id: '', jobId: jobId, workerId: workerId, contractorId: '', amount: amount),
      );
      state = const AsyncData(null);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
