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

  Future<void> initiatePayment(Payment payment) async {
    final docRef = _firestore.collection('payments').doc();
    final data = payment.toMap();
    data['createdAt'] = FieldValue.serverTimestamp();
    await docRef.set(data);
  }

  Future<void> markPaymentCompleted(String paymentId) async {
    await _firestore.collection('payments').doc(paymentId).update({
      'status': 'COMPLETED',
      'completedAt': FieldValue.serverTimestamp(),
    });
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
