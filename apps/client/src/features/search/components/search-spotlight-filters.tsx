import React, { useState, useEffect } from "react";
import cx from "clsx";
import {
  Button,
  Menu,
  Text,
  Group,
  getDefaultZIndex,
} from "@mantine/core";
import {
  IconChevronDown,
  IconBuilding,
  IconPlus,
  IconUser,
  IconTag,
  IconLetterCase,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { SpaceFilterMenu } from "@/features/space/components/space-filter-menu";
import { CreatorFilterMenu } from "@/features/search/components/creator-filter-menu";
import classes from "./search-spotlight-filters.module.css";
import { LabelFilterMenu } from "./label-filter-menu";

interface SearchSpotlightFiltersProps {
  onFiltersChange?: (filters: any) => void;
  spaceId?: string;
}

export function SearchSpotlightFilters({
  onFiltersChange,
  spaceId,
}: SearchSpotlightFiltersProps) {
  const { t } = useTranslation();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    spaceId || null
  );
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const [selectedCreatorName, setSelectedCreatorName] = useState<string | null>(
    null
  );
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [titleOnly, setTitleOnly] = useState(false);
  const [openedFilter, setOpenedFilter] = useState<string | null>(null);
  const [visibleFilters, setVisibleFilters] = useState<string[]>([]);

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const selectedSpaceData = selectedSpaceId
    ? spacesData?.items.find((space) => space.id === selectedSpaceId)
    : null;

  useEffect(() => {
    onFiltersChange?.({
      spaceId: selectedSpaceId,
      contentType: "page",
      creatorId: selectedCreatorId,
      labelIds: selectedLabelIds,
      titleOnly,
    });
  }, [
    selectedSpaceId,
    selectedCreatorId,
    selectedLabelIds,
    titleOnly,
    onFiltersChange,
  ]);

  const handleSpaceSelect = (spaceId: string | null) => {
    setSelectedSpaceId(spaceId);
  };

  const handleCreatorSelect = (user: { id: string; name: string } | null) => {
    setSelectedCreatorId(user?.id ?? null);
    setSelectedCreatorName(user?.name ?? null);
  };

  const handleLabelsSelect = (labelIds: string[]) => {
    setSelectedLabelIds(labelIds);
  };

  const onDemandFilters = [
    { key: "creator", label: t("Created by"), icon: IconUser, available: true },
    {
      key: "labels",
      label: t("Labels"),
      icon: IconTag,
      available: true,
    },
  ];

  const isFilterVisible = (key: string) => {
    if (openedFilter === key) return true;
    if (key === "creator") return !!selectedCreatorId;
    if (key === "labels") return selectedLabelIds.length > 0;
    return false;
  };

  const orderedVisibleFilters = visibleFilters.filter(isFilterVisible);
  const addableFilters = onDemandFilters.filter(
    (filter) => filter.available && !isFilterVisible(filter.key),
  );

  const revealFilter = (key: string) => {
    setVisibleFilters((prev) => [...prev.filter((k) => k !== key), key]);
    setOpenedFilter(key);
  };

  return (
    <div className={classes.filtersContainer}>
      <SpaceFilterMenu
        value={selectedSpaceId}
        onChange={handleSpaceSelect}
        position="bottom-start"
        width={250}
        zIndex={getDefaultZIndex("max")}
      >
        <Button
          variant="subtle"
          color="gray"
          size="sm"
          rightSection={<IconChevronDown size={14} />}
          leftSection={<IconBuilding size={16} />}
          className={classes.filterButton}
          fw={500}
        >
          {selectedSpaceId
            ? `${t("Space")}: ${selectedSpaceData?.name || t("Unknown")}`
            : `${t("Space")}: ${t("All spaces")}`}
        </Button>
      </SpaceFilterMenu>

      <Button
          variant={titleOnly ? "light" : "subtle"}
          color={titleOnly ? "blue" : "gray"}
          size="sm"
          radius="xl"
          leftSection={<IconLetterCase size={16} />}
          className={cx(
            classes.filterButton,
            titleOnly && classes.filterButtonActive,
          )}
          fw={500}
          aria-pressed={titleOnly}
          onClick={() => setTitleOnly(!titleOnly)}
        >
          {t("Title only")}
      </Button>

      {orderedVisibleFilters.map((filterKey) => {
        if (filterKey === "creator") {
          return (
            <CreatorFilterMenu
              key="creator"
              value={selectedCreatorId}
              onChange={handleCreatorSelect}
              position="bottom-start"
              width={250}
              zIndex={getDefaultZIndex("max")}
              opened={openedFilter === "creator"}
              onOpenChange={(opened) =>
                setOpenedFilter(opened ? "creator" : null)
              }
            >
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                rightSection={<IconChevronDown size={14} />}
                leftSection={<IconUser size={16} />}
                className={classes.filterButton}
                fw={500}
              >
                {selectedCreatorId
                  ? `${t("Created by")}: ${selectedCreatorName || t("Unknown")}`
                  : `${t("Created by")}: ${t("Anyone")}`}
              </Button>
            </CreatorFilterMenu>
          );
        }

        if (filterKey === "labels") {
          return (
            <LabelFilterMenu
              key="labels"
              value={selectedLabelIds}
              onChange={handleLabelsSelect}
              position="bottom-start"
              width={250}
              zIndex={getDefaultZIndex("max")}
              opened={openedFilter === "labels"}
              onOpenChange={(opened) =>
                setOpenedFilter(opened ? "labels" : null)
              }
            >
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                rightSection={<IconChevronDown size={14} />}
                leftSection={<IconTag size={16} />}
                className={classes.filterButton}
                fw={500}
              >
                {selectedLabelIds.length > 0
                  ? `${t("Labels")} (${selectedLabelIds.length})`
                  : t("Labels")}
              </Button>
            </LabelFilterMenu>
          );
        }

        return null;
      })}

      {addableFilters.length > 0 && (
        <Menu
          shadow="md"
          width={200}
          position="bottom-end"
          zIndex={getDefaultZIndex("max")}
        >
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconPlus size={16} />}
              className={classes.filterButton}
              style={{ marginLeft: "auto" }}
              fw={500}
            >
              {t("Filter")}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {addableFilters.map((filter) => (
              <Menu.Item
                key={filter.key}
                leftSection={<filter.icon size={16} />}
                onClick={() => revealFilter(filter.key)}
              >
                {filter.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  );
}
