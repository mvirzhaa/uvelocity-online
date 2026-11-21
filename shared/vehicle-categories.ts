/** Editable presentation groups. Categories do not affect ownership or vehicle physics. */
export interface VehicleCategory {
  id:string;
  name:string;
  sortOrder:number;
  version:number;
}

export interface VehicleCategoryList { categories:VehicleCategory[] }
export interface VehicleCategoryInput { name:string;sortOrder:number;reason:string }
export interface VehicleCategoryUpdate extends VehicleCategoryInput { expectedVersion:number }
