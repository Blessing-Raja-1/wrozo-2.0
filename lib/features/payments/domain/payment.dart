import 'package:cloud_firestore/cloud_firestore.dart';

enum PaymentStatus { pending, completed, failed }

class Payment {
  final String id;
  final String jobId;
  final String workerId;
  final String contractorId;
  final int amount;
  final PaymentStatus status;
  final DateTime? createdAt;
  final DateTime? completedAt;

  Payment({
    required this.id,
    required this.jobId,
    required this.workerId,
    required this.contractorId,
    required this.amount,
    this.status = PaymentStatus.pending,
    this.createdAt,
    this.completedAt,
  });

  factory Payment.fromMap(String id, Map<String, dynamic> data) {
    PaymentStatus parseStatus(String? val) {
      switch (val) {
        case 'COMPLETED': return PaymentStatus.completed;
        case 'FAILED': return PaymentStatus.failed;
        case 'PENDING':
        default:
          return PaymentStatus.pending;
      }
    }

    return Payment(
      id: id,
      jobId: data['jobId'] as String? ?? '',
      workerId: data['workerId'] as String? ?? '',
      contractorId: data['contractorId'] as String? ?? '',
      amount: data['amount'] as int? ?? 0,
      status: parseStatus(data['status'] as String?),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      completedAt: (data['completedAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    String formatStatus() {
      switch (status) {
        case PaymentStatus.completed: return 'COMPLETED';
        case PaymentStatus.failed: return 'FAILED';
        case PaymentStatus.pending: return 'PENDING';
      }
    }

    return {
      'jobId': jobId,
      'workerId': workerId,
      'contractorId': contractorId,
      'amount': amount,
      'status': formatStatus(),
      'createdAt': createdAt == null ? FieldValue.serverTimestamp() : Timestamp.fromDate(createdAt!),
      if (completedAt != null) 'completedAt': Timestamp.fromDate(completedAt!),
    };
  }
}
