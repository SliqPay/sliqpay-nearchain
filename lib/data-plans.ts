/**
 * Data bundle plans for Nigerian networks. These match VTPass's service-variations API.
 * In production, fetch these dynamically from VTPass. For the hackathon, common plans
 * are hardcoded to avoid the extra API call on every page load.
 */

export interface DataPlan {
  variationCode: string;
  name: string;
  amountNgn: number;
  validity: string;
}

export const DATA_PLANS: Record<string, DataPlan[]> = {
  'mtn-data': [
    { variationCode: 'mtn-20mb-100', name: '20MB', amountNgn: 100, validity: '1 day' },
    { variationCode: 'mtn-50mb-200', name: '50MB', amountNgn: 200, validity: '1 day' },
    { variationCode: 'mtn-150mb-500', name: '150MB', amountNgn: 500, validity: '7 days' },
    { variationCode: 'mtn-250mb-500', name: '250MB', amountNgn: 500, validity: '1 month' },
    { variationCode: 'mtn-500mb-1000', name: '500MB', amountNgn: 1000, validity: '1 month' },
    { variationCode: 'mtn-1gb-1500', name: '1GB', amountNgn: 1500, validity: '1 month' },
    { variationCode: 'mtn-2gb-2500', name: '2GB', amountNgn: 2500, validity: '1 month' },
    { variationCode: 'mtn-3gb-3000', name: '3GB', amountNgn: 3000, validity: '1 month' },
    { variationCode: 'mtn-5gb-5000', name: '5GB', amountNgn: 5000, validity: '1 month' },
  ],
  'airtel-data': [
    { variationCode: 'airt-50mb-100', name: '50MB', amountNgn: 100, validity: '1 day' },
    { variationCode: 'airt-200mb-300', name: '200MB', amountNgn: 300, validity: '3 days' },
    { variationCode: 'airt-350mb-500', name: '350MB', amountNgn: 500, validity: '7 days' },
    { variationCode: 'airt-750mb-1000', name: '750MB', amountNgn: 1000, validity: '14 days' },
    { variationCode: 'airt-1-5gb-1500', name: '1.5GB', amountNgn: 1500, validity: '1 month' },
    { variationCode: 'airt-2gb-2000', name: '2GB', amountNgn: 2000, validity: '1 month' },
    { variationCode: 'airt-4-5gb-3000', name: '4.5GB', amountNgn: 3000, validity: '1 month' },
    { variationCode: 'airt-10gb-5000', name: '10GB', amountNgn: 5000, validity: '1 month' },
  ],
  'glo-data': [
    { variationCode: 'glo-200mb-200', name: '200MB', amountNgn: 200, validity: '5 days' },
    { variationCode: 'glo-500mb-500', name: '500MB', amountNgn: 500, validity: '1 month' },
    { variationCode: 'glo-1-6gb-1000', name: '1.6GB', amountNgn: 1000, validity: '1 month' },
    { variationCode: 'glo-3-2gb-1500', name: '3.2GB', amountNgn: 1500, validity: '1 month' },
    { variationCode: 'glo-5-8gb-2500', name: '5.8GB', amountNgn: 2500, validity: '1 month' },
    { variationCode: 'glo-7-7gb-3000', name: '7.7GB', amountNgn: 3000, validity: '1 month' },
    { variationCode: 'glo-10gb-4000', name: '10GB', amountNgn: 4000, validity: '1 month' },
  ],
  'etisalat-data': [
    { variationCode: '9mob-500mb-500', name: '500MB', amountNgn: 500, validity: '1 month' },
    { variationCode: '9mob-1-5gb-1000', name: '1.5GB', amountNgn: 1000, validity: '1 month' },
    { variationCode: '9mob-2gb-1500', name: '2GB', amountNgn: 1500, validity: '1 month' },
    { variationCode: '9mob-4-5gb-2500', name: '4.5GB', amountNgn: 2500, validity: '1 month' },
    { variationCode: '9mob-11gb-4000', name: '11GB', amountNgn: 4000, validity: '1 month' },
    { variationCode: '9mob-15gb-5000', name: '15GB', amountNgn: 5000, validity: '1 month' },
  ],
};

export function getDataPlans(serviceID: string): DataPlan[] {
  return DATA_PLANS[serviceID] || [];
}

export function findDataPlan(serviceID: string, variationCode: string): DataPlan | undefined {
  return getDataPlans(serviceID).find((p) => p.variationCode === variationCode);
}
