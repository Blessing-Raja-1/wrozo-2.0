import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/payment_repository.dart';

final paymentControllerProvider = NotifierProvider.autoDispose<PaymentController, AsyncValue<void>>(() {
  return PaymentController();
});

class PaymentController extends AutoDisposeNotifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() {
    return const AsyncData(null);
  }

  /// Initiates an authoritative payment order creation on the server.
  ///
  /// The payable amount is derived authoritatively server-side from the job wage.
  /// Flutter never passes or controls the payment amount.
  Future<RazorpayOrderDetails?> createOrder({
    required String jobId,
    required String workerId,
  }) async {
    state = const AsyncLoading();
    try {
      final orderDetails = await ref.read(paymentRepositoryProvider).createPaymentOrder(
            jobId: jobId,
            workerId: workerId,
          );
      state = const AsyncData(null);
      return orderDetails;
    } catch (e, st) {
      state = AsyncError(e, st);
      return null;
    }
  }

  // SEC-02: Client-initiated direct payment writes are permanently prohibited.
  // Direct client writes to the payments ledger are blocked at the Firestore rules layer.
  // Payments must be created and verified via the server-side Razorpay integration.
  Future<void> payWorker({
    required String jobId,
    required String workerId,
    required int amount,
  }) async {
    state = const AsyncLoading();
    try {
      await createOrder(jobId: jobId, workerId: workerId);
    } catch (e, st) {
      state = AsyncError(e, st);
    }
  }
}
