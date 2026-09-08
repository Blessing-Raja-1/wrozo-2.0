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

class PaymentRepository {
  final FirebaseFirestore _firestore;

  PaymentRepository({required FirebaseFirestore firestore}) : _firestore = firestore;

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
