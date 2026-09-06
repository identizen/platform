import customersSource from './api/customers.ts?raw';
import signupSource from './routes/signup-route.tsx?raw';

export { SignupRoute } from './routes/signup-route';
export { createCustomer, findCustomer, firstName, type Customer } from './api/customers';

/** The real source of this feature, shown verbatim on the docs pages. */
export const CUSTOMERS_SOURCE = {
  directory: customersSource,
  signup: signupSource,
};
