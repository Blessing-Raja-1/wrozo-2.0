import 'package:cloud_firestore/cloud_firestore.dart';

class AppUser {
  final String uid;
  final String phone;
  final String? role; // 'WORKER', 'CONTRACTOR', or null if not yet selected
  final String status; // 'ACTIVE', 'SUSPENDED'

  AppUser({
    required this.uid,
    required this.phone,
    this.role,
    this.status = 'ACTIVE',
  });

  factory AppUser.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return AppUser(
      uid: doc.id,
      phone: data['phone'] as String? ?? '',
      role: data['role'] as String?,
      status: data['status'] as String? ?? 'ACTIVE',
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'phone': phone,
      'role': role,
      'status': status,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }
}
