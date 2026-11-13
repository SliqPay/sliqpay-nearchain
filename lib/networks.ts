// Nigerian mobile networks, as in sliqpay-frontend's airtime page. `serviceID` is VTPass's.

export type NetworkCode = 'MTN' | 'AIRTEL' | 'GLO' | '9MOBILE';

export interface Network {
  code: NetworkCode;
  name: string;
  serviceID: string;
  dataServiceID: string; // VTPass service ID for data bundles
  /** Optional: copy sliqpay-frontend/public/product-logos/* into public/product-logos/. */
  logo?: string;
}

export const NETWORKS: Network[] = [
  { code: 'MTN', name: 'MTN', serviceID: 'mtn', dataServiceID: 'mtn-data', logo: '/product-logos/mtn.jpg' },
  { code: 'AIRTEL', name: 'AIRTEL', serviceID: 'airtel', dataServiceID: 'airtel-data', logo: '/product-logos/airtel.jpg' },
  { code: 'GLO', name: 'GLO', serviceID: 'glo', dataServiceID: 'glo-data', logo: '/product-logos/glo.jpg' },
  { code: '9MOBILE', name: '9MOBILE (T2)', serviceID: 'etisalat', dataServiceID: 'etisalat-data' },
];

export function networkByCode(code: string): Network | undefined {
  return NETWORKS.find((n) => n.code === code);
}

/** Best guess from the number's prefix — a hint, never a rule (people port numbers). */
export function detectNetwork(phone: string): NetworkCode | null {
  const p = phone.slice(0, 4);
  if (['0803', '0806', '0703', '0706', '0813', '0816', '0810', '0814', '0903', '0906', '0913', '0916'].includes(p)) return 'MTN';
  if (['0802', '0808', '0708', '0812', '0701', '0902', '0901', '0904', '0907', '0912'].includes(p)) return 'AIRTEL';
  if (['0805', '0807', '0705', '0815', '0905', '0915'].includes(p)) return 'GLO';
  if (['0809', '0818', '0817', '0908', '0909'].includes(p)) return '9MOBILE';
  return null;
}

export function isValidNigerianPhone(phone: string): boolean {
  return /^0[789][01]\d{8}$/.test(phone);
}
