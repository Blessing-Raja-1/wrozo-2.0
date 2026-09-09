import 'package:cloud_firestore/cloud_firestore.dart';

class UserCapabilities {
  final bool worker;
  final bool contractor;

  const UserCapabilities({
    this.worker = false,
    this.contractor = false,
  });

  factory UserCapabilities.fromMap(Map<String, dynamic>? map) {
    if (map == null) return const UserCapabilities();
    return UserCapabilities(
      worker: map['worker'] as bool? ?? false,
      contractor: map['contractor'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() => {
    'worker': worker,
    'contractor': contractor,
  };
}

class AppUser {
  final String uid;
  final String phone;
  final String? role; // Legacy: 'WORKER', 'CONTRACTOR', or null if unassigned
  final String status; // 'ACTIVE', 'SUSPENDED'
  final UserCapabilities capabilities;
  final String? activeMode; // 'WORKER', 'CONTRACTOR'

  AppUser({
    required this.uid,
    required this.phone,
    this.role,
    this.status = 'ACTIVE',
    this.capabilities = const UserCapabilities(),
    this.activeMode,
  });

  bool get hasWorkerCapability => capabilities.worker || role == 'WORKER';
  bool get hasContractorCapability => capabilities.contractor || role == 'CONTRACTOR';
  bool get isDualRole => hasWorkerCapability && hasContractorCapability;
  bool get hasSetupRoles => hasWorkerCapability || hasContractorCapability;

  String get currentActiveMode {
    if (activeMode != null && (activeMode == 'WORKER' || activeMode == 'CONTRACTOR')) {
      if (activeMode == 'WORKER' && hasWorkerCapability) return 'WORKER';
      if (activeMode == 'CONTRACTOR' && hasContractorCapability) return 'CONTRACTOR';
    }
    if (hasWorkerCapability && !hasContractorCapability) return 'WORKER';
    if (hasContractorCapability && !hasWorkerCapability) return 'CONTRACTOR';
    return 'WORKER';
  }

  factory AppUser.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    final rawCaps = data['capabilities'] as Map<String, dynamic>?;
    return AppUser(
      uid: doc.id,
      phone: data['phone'] as String? ?? '',
      role: data['role'] as String?,
      status: data['status'] as String? ?? 'ACTIVE',
      capabilities: UserCapabilities.fromMap(rawCaps),
      activeMode: data['activeMode'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'phone': phone,
      'role': role,
      'status': status,
      'capabilities': capabilities.toMap(),
      'activeMode': activeMode,
      'createdAt': FieldValue.serverTimestamp(),
    };
  }
}
