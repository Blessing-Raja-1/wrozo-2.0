import 'package:cloud_firestore/cloud_firestore.dart';

enum JobStatus { open, inProgress, completed, cancelled }

class Job {
  final String id;
  final String contractorId;
  final String title;
  final String description;
  final List<String> skillsRequired;
  final int wage;
  final JobStatus status;
  final int workerCountNeeded;
  final DateTime? createdAt;
  final String? geohash;
  final GeoPoint? location;

  Job({
    required this.id,
    required this.contractorId,
    required this.title,
    required this.description,
    required this.skillsRequired,
    required this.wage,
    this.status = JobStatus.open,
    this.workerCountNeeded = 1,
    this.createdAt,
    this.geohash,
    this.location,
  });

  factory Job.fromMap(String id, Map<String, dynamic> data) {
    JobStatus parseStatus(String? val) {
      switch (val) {
        case 'IN_PROGRESS': return JobStatus.inProgress;
        case 'COMPLETED': return JobStatus.completed;
        case 'CANCELLED': return JobStatus.cancelled;
        case 'OPEN':
        default:
          return JobStatus.open;
      }
    }

    return Job(
      id: id,
      contractorId: data['contractorId'] as String? ?? '',
      title: data['title'] as String? ?? '',
      description: data['description'] as String? ?? '',
      skillsRequired: List<String>.from(data['skillsRequired'] ?? []),
      wage: data['wage'] as int? ?? 0,
      status: parseStatus(data['status'] as String?),
      workerCountNeeded: data['workerCountNeeded'] as int? ?? 1,
      createdAt: (data['createdAt'] as Timestamp?)?.toDate(),
      geohash: data['geohash'] as String?,
      location: data['location'] as GeoPoint?,
    );
  }

  Map<String, dynamic> toMap() {
    String formatStatus() {
      switch (status) {
        case JobStatus.inProgress: return 'IN_PROGRESS';
        case JobStatus.completed: return 'COMPLETED';
        case JobStatus.cancelled: return 'CANCELLED';
        case JobStatus.open: return 'OPEN';
      }
    }

    return {
      'contractorId': contractorId,
      'title': title,
      'description': description,
      'skillsRequired': skillsRequired,
      'wage': wage,
      'status': formatStatus(),
      'workerCountNeeded': workerCountNeeded,
      'createdAt': createdAt == null ? FieldValue.serverTimestamp() : Timestamp.fromDate(createdAt!),
      if (geohash != null) 'geohash': geohash,
      if (location != null) 'location': location,
    };
  }
}
