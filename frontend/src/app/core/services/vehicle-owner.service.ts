import { Injectable } from '@angular/core';
import { PocketBaseService } from './pocketbase.service';

export interface OwnerOption {
  id: string;
  displayName: string;
}

export interface AssignOwnerResult {
  status: string;
  vehicle_id: string;
  owner_id: string;
  previous_owner_id: string;
  updated_accesses: number;
}

/**
 * Owner search + assignment shared by the vehicles and access-logs pages.
 * Assignment goes through POST /api/vehicles/assign-owner so the owner is set
 * and cascaded onto the vehicle's access history in a single server call.
 */
@Injectable({ providedIn: 'root' })
export class VehicleOwnerService {
  constructor(private pbService: PocketBaseService) {}

  private get pb() {
    return this.pbService.pb;
  }

  getOwnerDisplayName(user: any): string {
    if (!user) {
      return '';
    }
    if (user.user_type === 'company') {
      return user.name?.trim() || user.email || '';
    }
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return fullName || user.name?.trim() || user.email || '';
  }

  async searchOwners(query: string): Promise<OwnerOption[]> {
    const q = (query || '').trim();
    const escaped = q.replace(/"/g, '\\"');
    const base = 'role = "regular" && (user_type = "person" || user_type = "employee" || user_type = "company")';
    const where = q
      ? ` && (first_name ~ "${escaped}" || last_name ~ "${escaped}" || name ~ "${escaped}" || email ~ "${escaped}")`
      : '';

    try {
      const res = await this.pb.collection('users').getList(1, 10, {
        filter: `${base}${where}`,
        sort: 'name,first_name,last_name,email',
      });
      return res.items.map((r: any) => ({
        id: r.id,
        displayName: this.getOwnerDisplayName(r) || r.email || r.id,
      }));
    } catch {
      return [];
    }
  }

  assignOwner(vehicleId: string, ownerId: string): Promise<AssignOwnerResult> {
    return this.pb.send('/api/vehicles/assign-owner', {
      method: 'POST',
      body: { vehicle_id: vehicleId, owner_id: ownerId },
    });
  }
}
