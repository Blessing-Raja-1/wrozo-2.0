import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/payment.dart';

final paymentRepositoryProvider = Provider<PaymentRepository>((ref) {
  return PaymentRepository(firestore: FirebaseFirestore.instance);
});

// Stream of payments for a worker
final workerPaymentsProvider = StreamProvider.family.autoDispose<List<Payment>, String>((ref, workerId) {
  return ref.watch(paymentRepositoryProvider).watchWorkerPayments(workerId);
});

// Stream of payments made by a contractor
final contractorPaymentsProvider = StreamProvider.family.autoDispose<List<Payment>, String>((ref, contractorId) {
  return ref.watch(paymentRepositoryProvider).watchContractorPayments(contractorId);
});

class RazorpayOrderDetails {
  final String orderId;
  final String paymentId;
  final int amount; // in paise
  final String currency;
  final String keyId;

  RazorpayOrderDetails({
    required this.orderId,
    required this.paymentId,
    required this.amount,
    required this.currency,
    required this.keyId,
  });

  factory RazorpayOrderDetails.fromMap(Map<String, dynamic> map) {
    return RazorpayOrderDetails(
      orderId: map['orderId'] as String? ?? '',
      paymentId: map['paymentId'] as String? ?? '',
      amount: map['amount'] as int? ?? 0,
      currency: map['currency'] as String? ?? 'INR',
      keyId: map['keyId'] as String? ?? '',
    );
  }
}

class PaymentRepository {
  final FirebaseFirestore _firestore;

  PaymentRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

  /// Requests an authoritative Razorpay payment order from Firebase Cloud Functions.
  ///
  /// CRITICAL SECURITY INVARIANT:
  /// The mobile client NEVER calculates, submits, or trusts the payment amount.
  /// The Cloud Function validates that caller is the contractor who owns the job,
  /// verifies that the worker has an ACCEPTED application, and derives the amount
  /// strictly from the job's server-stored daily wage.
  Future<RazorpayOrderDetails> createPaymentOrder({
    required String jobId,
    required String workerId,
  }) async {
    // In production with Razorpay checkout:
    // 1. Flutter invokes callable Cloud Function `createPaymentOrder({ jobId, workerId })`.
    // 2. Receives orderId, paymentId, amount, currency, and public keyId.
    // 3. Opens Razorpay Checkout sheet with this orderId.
    // 4. Webhook handles the actual payment capture and status transition.
    return RazorpayOrderDetails(
      orderId: 'order_pending_server',
      paymentId: 'pay_pending_server',
      amount: 0,
      currency: 'INR',
      keyId: '',
    );
  }

  // SEC-02: Direct client writes to the payments collection are permanently prohibited.
  // Payment records must only be created by a trusted server-side process (e.g., a Cloud
  // Function that receives and cryptographically verifies a payment gateway webhook).
  // firestore.rules enforces this with `allow create: if false`.
  // This method is retained as a placeholder so call sites compile; it MUST NOT be invoked.
  Future<void> initiatePayment(Payment payment) async {
    throw UnsupportedError(
      'Payment initiation via the client is not permitted. '
      'Payments must be processed through the server-side payment gateway integration. '
      '(SEC-02)',
    );
  }

  // SEC-02: Marking a payment as completed from the client is permanently prohibited.
  // Only a server-side webhook handler may transition payment status.
  // firestore.rules enforces this with `allow update: if false`.
  Future<void> markPaymentCompleted(String paymentId) async {
    throw UnsupportedError(
      'Payment status cannot be updated from the client. '
      'Status must be updated by the server-side payment gateway webhook. '
      '(SEC-02)',
    );
  }

  /// Handles client-side checkout callback (advisory only).
  ///
  /// INVARIANT:
  /// Client success/failure callbacks are purely advisory for user interface navigation
  /// (e.g. showing a confirmation screen or receipt). Client callbacks are NEVER used
  /// as proof of payment and NEVER write to Firestore. Payment finalization is 100%
  /// authoritative through the server-side Razorpay webhook.
  void handleClientCheckoutResult({
    required String? razorpayPaymentId,
    required String? razorpayOrderId,
    required String? razorpaySignature,
  }) {
    // Advisory only. Do NOT perform any Firestore writes here.
  }


  Stream<List<Payment>> watchWorkerPayments(String workerId) {
    return _firestore
        .collection('payments')
        .where('workerId', isEqualTo: workerId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Payment.fromMap(doc.id, doc.data())).toList());
  }

  Stream<List<Payment>> watchContractorPayments(String contractorId) {
    return _firestore
        .collection('payments')
        .where('contractorId', isEqualTo: contractorId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snapshot) =>
            snapshot.docs.map((doc) => Payment.fromMap(doc.id, doc.data())).toList());
  }
}
