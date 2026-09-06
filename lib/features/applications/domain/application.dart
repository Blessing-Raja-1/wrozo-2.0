import 'package:cloud_firestore/cloud_firestore.dart';

enum ApplicationStatus { pending, accepted, rejected, withdrawn }

class Application {
  final String id;
  final String jobId;
  final String workerId;
  final String contractorId;
  final ApplicationStatus status;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  Application({
    required this.id,
    required this.jobId,
    required this.workerId,
    required this.contractorId,
    this.status = ApplicationStatus.pending,
    this.createdAt,
    this.updatedAt,
  });

  factory Application.fromMap(String id, Map<String, dynamic> data) {
    ApplicationStatus parseStatus(String? val) {
      switch (val) {
        case 'ACCEPTED': return ApplicationStatus.accepted;
        case 'REJECTED': return ApplicationStatus.rejected;
        case 'WITHDRAWN': return ApplicationStatus.withdrawn;
        case 'PENDING':
        default:
          return ApplicationStatus.pending;
      }
    }

    return Application(
      id: id,
      jobId: data['jobId'] as String? ?? '',
      workerId: data['workerId'] as String? ?? '',
      contractorId: data['contractorId'] as String? ?? '',
      status: parseStatus(data['status'] as String?),
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      updatedAt: (data['updatedAt'] as Timestamp?)?.toDate(),
    );
  }

  Map<String, dynamic> toMap() {
    String formatStatus() {
      switch (status) {
        case ApplicationStatus.accepted: return 'ACCEPTED';
        case ApplicationStatus.rejected: return 'REJECTED';
        case ApplicationStatus.withdrawn: return 'WITHDRAWN';
        case ApplicationStatus.pending: return 'PENDING';
      }
    }

    return {
      'jobId': jobId,
      'workerId': workerId,
      'contractorId': contractorId,
      'status': formatStatus(),
      'createdAt': createdAt == null ? FieldValue.serverTimestamp() : Timestamp.fromDate(createdAt!),
      'updatedAt': FieldValue.serverTimestamp(),
    };
  }
}
