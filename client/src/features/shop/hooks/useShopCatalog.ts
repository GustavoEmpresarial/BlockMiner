import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getShopMiners } from '../lib/shop.api';
import type {
  ShopCatalogFan,
  ShopCatalogMiner,
  ShopCatalogRack,
} from '../lib/shop.types';
import { reportApiFailure } from '../../../shared/utils/reportApiFailure';

export function useShopCatalog() {
  const { t } = useTranslation();
  const [miners, setMiners] = useState<ShopCatalogMiner[]>([]);
  const [fans, setFans] = useState<ShopCatalogFan[]>([]);
  const [racks, setRacks] = useState<ShopCatalogRack[]>([]);
  const [shopCurrency, setShopCurrency] = useState('BLK');
  const [fanSalesAvailableAt, setFanSalesAvailableAt] = useState<string | null>(null);
  const [rackSalesAvailableAt, setRackSalesAvailableAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getShopMiners();
      if (res.data?.ok) {
        setMiners(res.data.miners ?? []);
        setFans(res.data.fans ?? []);
        setRacks(Array.isArray(res.data.racks) ? res.data.racks : []);
        setShopCurrency(res.data.currency || 'BLK');
        setFanSalesAvailableAt(res.data.fanSalesAvailableAt ?? null);
        setRackSalesAvailableAt(res.data.rackSalesAvailableAt ?? null);
      }
    } catch (err) {
      reportApiFailure(
        {
          operation: 'shop_list_miners',
          message: 'Failed to load shop miners catalog',
        },
        err,
      );
      toast.error(t('shop.errors.list_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    miners,
    fans,
    racks,
    shopCurrency,
    fanSalesAvailableAt,
    rackSalesAvailableAt,
    loading,
    reload: load,
  };
}
