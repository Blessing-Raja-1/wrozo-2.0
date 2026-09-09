import 'package:cloud_firestore/cloud_firestore.dart';

enum PaymentStatus {
  created,
  authorized,
  captured,
  failed,
  refunded,
  pending,
  completed,
}

class Payment {
  final String id;
  final String jobId;
  final String workerId;
  final String contractorId;
  final int amount;
  final PaymentStatus status;
  final DateTime? createdAt;
  final DateTime? completedAt;
  final String? razorpayOrderId;
  final String? razorpayPaymentId;

  Payment({
    required this.id,
    required this.jobId,
    required this.workerId,
    required this.contractorId,
    required this.amount,
    this.status = PaymentStatus.created,
    this.createdAt,
    this.completedAt,
    this.razorpayOrderId,
    this.razorpayPaymentId,
  });

  factory Payment.fromMap(String id, Map<String, dynamic> data) {
    PaymentStatus parseStatus(String? val) {
      switch (val) {
        case 'CAPTURED':
        case 'COMPLETED':
          return PaymentStatus.captured;
        case 'AUTHORIZED':
          return PaymentStatus.authorized;
        case 'FAILED':
          return PaymentStatus.failed;
        case 'REFUNDED':
          return PaymentStatus.refunded;
        case 'CREATED':
        case 'PENDING':
        default:
          return PaymentStatus.created;
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
      razorpayOrderId: data['razorpayOrderId'] as String?,
      razorpayPaymentId: data['razorpayPaymentId'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    String formatStatus() {
      switch (status) {
        case PaymentStatus.captured:
        case PaymentStatus.completed:
          return 'CAPTURED';
        case PaymentStatus.authorized:
          return 'AUTHORIZED';
        case PaymentStatus.failed:
          return 'FAILED';
        case PaymentStatus.refunded:
          return 'REFUNDED';
        case PaymentStatus.created:
        case PaymentStatus.pending:
          return 'CREATED';
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
      if (razorpayOrderId != null) 'razorpayOrderId': razorpayOrderId,
      if (razorpayPaymentId != null) 'razorpayPaymentId': razorpayPaymentId,
    };
  }
}
