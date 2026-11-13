/**
 * Nigerian electricity distribution companies (DISCOs) supported through VTPass.
 */

export interface ElectricityProvider {
  code: string;
  name: string;
  serviceID: string;
  shortName: string;
}

export const ELECTRICITY_PROVIDERS: ElectricityProvider[] = [
  { code: 'EKEDC', name: 'Eko Electricity', serviceID: 'eko-electric', shortName: 'Eko' },
  { code: 'IKEDC', name: 'Ikeja Electric', serviceID: 'ikeja-electric', shortName: 'Ikeja' },
  { code: 'AEDC', name: 'Abuja Electricity', serviceID: 'abuja-electric', shortName: 'Abuja' },
  { code: 'PHED', name: 'Port Harcourt Electricity', serviceID: 'portharcourt-electric', shortName: 'Port Harcourt' },
  { code: 'JED', name: 'Jos Electricity', serviceID: 'jos-electric', shortName: 'Jos' },
  { code: 'IBEDC', name: 'Ibadan Electricity', serviceID: 'ibadan-electric', shortName: 'Ibadan' },
  { code: 'KAEDCO', name: 'Kaduna Electric', serviceID: 'kaduna-electric', shortName: 'Kaduna' },
  { code: 'KAEDC', name: 'Kano Electricity', serviceID: 'kano-electric', shortName: 'Kano' },
];

export function providerByCode(code: string): ElectricityProvider | undefined {
  return ELECTRICITY_PROVIDERS.find((p) => p.code === code);
}

export function isValidMeterNumber(meterNumber: string): boolean {
  // Nigerian meter numbers are typically 11-13 digits
  return /^\d{11,13}$/.test(meterNumber);
}

export type MeterType = 'prepaid' | 'postpaid';
