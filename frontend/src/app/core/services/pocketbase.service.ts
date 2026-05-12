import { Injectable } from '@angular/core';
import PocketBase from 'pocketbase';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PocketBaseService {
  readonly pb: PocketBase;
  readonly backendUrl: string;

  constructor() {
    this.backendUrl = this.resolveBackendUrl();
    this.pb = new PocketBase(this.backendUrl);
  }

  private resolveBackendUrl(): string {
    // If environment has a hardcoded URL, use it.
    if (environment.backendUrl) {
      return environment.backendUrl;
    }

    const { hostname, protocol, origin } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return `${protocol}//${hostname}:8090`;
    }

    // Accessing via LAN IP on a dev port — point to PocketBase on the same host
    const { port } = window.location;
    if (port && port !== '80' && port !== '443') {
      return `${protocol}//${hostname}:8090`;
    }

    return origin;
  }

  getRedirectUrl(tagId: string): string {
    return `${this.backendUrl}/r/${tagId}`;
  }
}
