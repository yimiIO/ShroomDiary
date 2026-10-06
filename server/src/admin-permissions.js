'use strict';

const ROLE_PERMISSIONS = Object.freeze({
  OWNER: ['dashboard.read', 'users.read', 'users.write', 'users.sessions', 'features.read', 'features.write',
    'agents.read', 'agents.write', 'content.read', 'content.write', 'audit.read', 'system.read',
    'members.read', 'members.write'],
  OPERATOR: ['dashboard.read', 'users.read', 'users.sessions', 'features.read', 'features.write',
    'agents.read', 'agents.write', 'content.read', 'content.write', 'audit.read', 'system.read'],
  SUPPORT: ['dashboard.read', 'users.read', 'users.sessions', 'features.read',
    'agents.read', 'content.read', 'system.read'],
  VIEWER: ['dashboard.read', 'users.read', 'features.read', 'agents.read', 'content.read', 'audit.read',
    'system.read']
});

function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

module.exports = { ROLE_PERMISSIONS, permissionsForRole };
