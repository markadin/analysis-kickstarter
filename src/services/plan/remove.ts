import { fetchDeviceList } from "../../lib/fetchDeviceList";
import { RouterConstructorData } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorData) => {
  const plan_name = scope.find((x) => x.variable === "plan_data");

  const org_dev_list = await fetchDeviceList(account, [
    { key: "device_type", value: "organization" },
    { key: "plan_group", value: plan_name.group },
  ]);

  //do not let the user delete the plan if there's an organization assigned to it.
  if (org_dev_list.length > 0) {
    await config_dev.sendData(scope);
  }

  return console.debug("Plan deleted");
};
