"use client";
import React from "react";
import {
  RankComponent,
  StatusGrid,
  PoolInformation,
  CampusInformation,
  ContactInformation,
} from "@/component/dashboard/dashboard";
import { ContextCreator } from "@/component/context/context";
import { ContextProps, UserData } from "@/component/context/context.types";
import LevelHistory from "@/component/dashboard/LevelHistory";

const Dashboard = () => {
  const { userData } = React.useContext(ContextCreator) as ContextProps;

  return (
    <div
      className="flex flex-1 overflow-auto overflow-x-hidden p-2 sm:p-4 lg:p-6 gap-1 z-10 w-full flex-col lg:flex-row lg:items-stretch min-w-0"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {/* Main Content */}
      <main className="flex-1 min-w-0 lg:min-h-0 flex flex-col gap-3 w-full">
        <div className="w-full min-h-[140px] sm:min-h-[180px] min-w-0 flex-shrink-0">
          <RankComponent userData={userData as UserData} rank={-1} />
        </div>

        <div
          className="relative grow shrink-0 border-4 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4 lg:p-6 flex flex-col gap-4 sm:gap-6 min-w-0"
          style={{
            boxShadow: "none",
          }}
        >
          {/* Pixel corner accents - muted */}
          <div className="absolute top-0 left-0 w-4 h-4 border-l-2 border-t-2 border-[#a0a6b0]" />
          <div className="absolute top-0 right-0 w-4 h-4 border-r-2 border-t-2 border-[#a0a6b0]" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-l-2 border-b-2 border-[#a0a6b0]" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-r-2 border-b-2 border-[#a0a6b0]" />
          {userData != null ? (
            <>
              <StatusGrid
                wallet={userData.wallet}
                kind={userData.kind}
                staff={userData.staff}
                correction_point={userData.correction_point}
                badge={userData.badge}
                muted
              />
              <PoolInformation
                pool_month={userData.pool_month}
                pool_year={userData.pool_year}
                location={userData.location}
                muted
              />
              <CampusInformation
                campus_name={userData.campus_name}
                campus_id={userData.campus_id}
                muted
              />
              <ContactInformation email={userData.email} muted />
            </>
          ) : (
            <div className="flex-1 flex flex-col gap-4 sm:gap-6">
              {/* StatusGrid skeleton */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="border-2 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4" style={{ boxShadow: "none" }}>
                    <div className="h-3 w-20 mb-2 skeleton-shimmer rounded-sm" />
                    <div className="h-5 w-12 skeleton-shimmer rounded-sm" />
                    <div className="h-2.5 w-28 mt-2 skeleton-shimmer rounded-sm" />
                  </div>
                ))}
              </div>
              {/* PoolInformation skeleton */}
              <div>
                <div className="h-3 w-24 mb-2 skeleton-shimmer rounded-sm" />
                <div className="border-2 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4" style={{ boxShadow: "none" }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    <div><div className="h-2.5 w-16 mb-1.5 skeleton-shimmer rounded-sm" /><div className="h-4 w-24 skeleton-shimmer rounded-sm" /></div>
                    <div><div className="h-2.5 w-20 mb-1.5 skeleton-shimmer rounded-sm" /><div className="h-4 w-28 skeleton-shimmer rounded-sm" /></div>
                  </div>
                </div>
              </div>
              {/* CampusInformation skeleton */}
              <div>
                <div className="h-3 w-28 mb-2 skeleton-shimmer rounded-sm" />
                <div className="border-2 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4 flex justify-between items-center" style={{ boxShadow: "none" }}>
                  <div><div className="h-4 w-32 skeleton-shimmer rounded-sm mb-1" /><div className="h-2.5 w-20 skeleton-shimmer rounded-sm" /></div>
                  <div><div className="h-2.5 w-12 mb-1 skeleton-shimmer rounded-sm ml-auto" /><div className="h-3 w-14 skeleton-shimmer rounded-sm" /></div>
                </div>
              </div>
              {/* ContactInformation skeleton */}
              <div>
                <div className="h-3 w-36 mb-2 skeleton-shimmer rounded-sm" />
                <div className="border-2 border-[#a0a6b0] bg-[#ece9d8] p-3 sm:p-4 flex items-center gap-2 sm:gap-3" style={{ boxShadow: "none" }}>
                  <div className="w-8 h-8 border-2 border-[#a0a6b0] skeleton-shimmer rounded-sm flex-shrink-0" />
                  <div className="flex-1 min-w-0"><div className="h-4 w-40 skeleton-shimmer rounded-sm" /><div className="h-2.5 w-28 mt-1 skeleton-shimmer rounded-sm" /></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {userData != null && <LevelHistory />}
      </main>

    </div>
  );
};

export default Dashboard;
